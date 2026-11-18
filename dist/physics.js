(function () {
  'use strict';

  // The visible bowl is 2.44 scene units wide. Its bottom is solid and its
  // sloped sides are eight independent hollow sectors, each split by height.
  // This leaves the interior open for the next bowl to nest inside.
  const SECTORS = 8;
  const WALL = [
    { lowY: .025, highY: .23, lowOuter: .4, lowInner: .4, highOuter: .78, highInner: .44 },
    { lowY: .23, highY: .49, lowOuter: .78, lowInner: .44, highOuter: 1.007, highInner: .92 },
    { lowY: .49, highY: .78, lowOuter: 1.007, lowInner: .92, highOuter: 1.22, highInner: 1.15 }
  ];

  function sectorVertices(section, firstAngle, lastAngle) {
    const vertices = [];
    for (const angle of [firstAngle, lastAngle]) {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      for (const [radius, y] of [
        [section.lowOuter, section.lowY],
        [section.lowInner, section.lowY],
        [section.highOuter, section.highY],
        [section.highInner, section.highY]
      ]) {
        vertices.push(radius * cosine, y, radius * sine);
      }
    }
    return new Float32Array(vertices);
  }

  function createBowlPhysics(RAPIER) {
    const world = new RAPIER.World({ x: 0, y: -55, z: 0 });
    world.timestep = 1 / 120;
    const bodies = new Map();
    const colliders = new Map();
    let nextId = 1;
    let remainder = 0;
    let balancing = false;
    let balanceInput = 0;
    let trayTilt = 0;
    let trayAngularVelocity = 0;

    function trayRotation() {
      const half = trayTilt * .5;
      return { x: 0, y: 0, z: -Math.sin(half), w: Math.cos(half) };
    }

    // The tray pivots around its raised center. Its collider is moved through
    // Rapier's kinematic body so bowls receive real contact velocities.
    const trayBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, .45, 0)
    );
    const tray = world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.655, .015, 1.255)
        .setFriction(.16)
        .setRestitution(.025),
      trayBody
    );
    // The counter remains below the swept tray, catching anything spilled.
    const floor = world.createCollider(
      RAPIER.ColliderDesc.cuboid(15, .275, 4)
        .setTranslation(0, -.48, .6)
        .setFriction(.66)
        .setRestitution(.035)
    );

    function spawnBowl(initial, velocity) {
      const translation = initial || {};
      const movement = velocity || {};
      const rotation = translation.rotation || { x: 0, y: 0, z: 0, w: 1 };
      const angular = movement.angular || { x: 0, y: 0, z: 0 };
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(translation.x || 0, translation.y || 0, translation.z || 0)
          .setRotation(rotation)
          .setLinvel(movement.x || 0, movement.y || 0, movement.z || 0)
          .setAngvel(angular)
          .setLinearDamping(.13)
          .setAngularDamping(.2)
          .setCcdEnabled(true)
      );

      const pieces = [];
      pieces.push(world.createCollider(
        RAPIER.ColliderDesc.cylinder(.0225, .52)
          .setTranslation(0, .018, 0)
          .setDensity(4.5)
          .setFriction(.2)
          .setRestitution(.02),
        body
      ));
      pieces.push(world.createCollider(
        RAPIER.ColliderDesc.cylinder(.1025, .42)
          .setTranslation(0, .1275, 0)
          .setDensity(4.5)
          .setFriction(.54)
          .setRestitution(.02),
        body
      ));

      for (const section of WALL) {
        for (let index = 0; index < SECTORS; index++) {
          const start = (index - .5) * 2 * Math.PI / SECTORS;
          const end = (index + .5) * 2 * Math.PI / SECTORS;
          const shape = RAPIER.ColliderDesc.convexHull(sectorVertices(section, start, end));
          if (!shape) throw new Error('Could not construct the bowl collision shape.');
          pieces.push(world.createCollider(
            shape.setDensity(1.45).setFriction(.54).setRestitution(.02),
            body
          ));
        }
      }

      const id = nextId++;
      bodies.set(id, body);
      colliders.set(id, pieces);
      return id;
    }

    function setBalancing(enabled, direction) {
      if (balancing === !!enabled) return;
      balancing = !!enabled;
      balanceInput = 0;
      const initialDirection = Number.isFinite(direction) && direction < 0 ? -1 : 1;
      trayTilt = balancing ? .018 * initialDirection : 0;
      trayAngularVelocity = balancing ? .045 * initialDirection : 0;
      trayBody.setRotation(trayRotation(), true);
    }

    function setBalanceInput(axis) {
      balanceInput = Number.isFinite(axis) ? Math.max(-1, Math.min(1, axis)) : 0;
    }

    function trayPose() {
      return {
        x: 0,
        y: .45,
        z: 0,
        tilt: trayTilt,
        angularVelocity: trayAngularVelocity,
        rotation: trayRotation()
      };
    }

    function advanceTray() {
      if (!balancing) return;
      let weightedX = 0;
      let totalWeight = 0;
      for (const body of bodies.values()) {
        const position = body.translation();
        const verticalSpeed = body.linvel().y;
        // Bodies on the counter or still dropping cannot load the hand-held
        // tray. Resting stack members remain part of its tipping moment.
        if (position.y < .3 || Math.abs(position.x) > 1.9 ||
            Math.abs(position.z) > 1.5 || Math.abs(verticalSpeed) > 1.5) continue;
        const weight = 1 + Math.max(0, position.y - .45) * .32;
        weightedX += position.x * weight;
        totalWeight += weight;
      }
      const centerX = totalWeight ? weightedX / totalWeight : 0;
      const load = Math.min(totalWeight, 12);
      const gravityTorque = .65 * Math.sin(trayTilt) + 1.9 * centerX * (1 + .11 * load);
      const angularAcceleration = gravityTorque + 2.6 * balanceInput - .55 * trayAngularVelocity;
      trayAngularVelocity += angularAcceleration * world.timestep;
      trayTilt += trayAngularVelocity * world.timestep;
      if (trayTilt > .34) {
        trayTilt = .34;
        trayAngularVelocity = Math.min(0, trayAngularVelocity);
      } else if (trayTilt < -.34) {
        trayTilt = -.34;
        trayAngularVelocity = Math.max(0, trayAngularVelocity);
      }
      trayBody.setNextKinematicRotation(trayRotation());
    }

    function step(deltaSeconds) {
      remainder += Math.min(Math.max(deltaSeconds || 0, 0), .1);
      let steps = 0;
      while (remainder >= world.timestep && steps < 12) {
        advanceTray();
        world.step();
        remainder -= world.timestep;
        steps++;
      }
    }

    function pose(id) {
      const body = bodies.get(id);
      if (!body) return null;
      const position = body.translation();
      const rotation = body.rotation();
      const velocity = body.linvel();
      const angularVelocity = body.angvel();
      const upX = 2 * (rotation.x * rotation.y - rotation.z * rotation.w);
      const upY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
      return {
        x: position.x,
        y: position.y,
        z: position.z,
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
        tilt: Math.atan2(upX, upY),
        vx: velocity.x,
        vy: velocity.y,
        vz: velocity.z,
        angularSpeed: Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z),
        sleeping: body.isSleeping()
      };
    }

    function piecesTouch(aPieces, bPieces) {
      if (!aPieces || !bPieces) return false;
      const otherHandles = new Set(bPieces.map(collider => collider.handle));
      for (const collider of aPieces) {
        let touching = false;
        world.contactPairsWith(collider, other => {
          if (!otherHandles.has(other.handle)) return;
          world.contactPair(collider, other, manifold => {
            if (manifold.numSolverContacts() > 0) touching = true;
          });
        });
        if (touching) return true;
      }
      return false;
    }

    function touches(id, otherId) {
      return piecesTouch(colliders.get(id), colliders.get(otherId));
    }

    function touchesTray(id) {
      return piecesTouch(colliders.get(id), [tray]);
    }

    function touchesFloor(id) {
      return piecesTouch(colliders.get(id), [floor]);
    }

    function destroy() {
      bodies.clear();
      colliders.clear();
      world.free();
    }

    return {
      spawnBowl, step, pose, touches, touchesTray, touchesFloor,
      setBalancing, setBalanceInput, trayPose, destroy
    };
  }

  window.createBowlPhysics = createBowlPhysics;
})();
