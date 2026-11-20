(function () {
  'use strict';

  // Shared height for the fixed serving tray and both renderers.
  const TRAY_Y = -.15;
  window.BOWL_TRAY_Y = TRAY_Y;

  // The visible bowl is 2.44 scene units wide. Its bottom is solid and its
  // sloped sides are eight independent hollow sectors, each split by height.
  // This leaves the interior open for the next bowl to nest inside.
  const SECTORS = 8;
  const WALL = [
    { lowY: .025, highY: .23, lowOuter: .4, lowInner: .4, highOuter: .78, highInner: .55 },
    { lowY: .23, highY: .49, lowOuter: .78, lowInner: .55, highOuter: 1.007, highInner: .92 },
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
    world.integrationParameters.numSolverIterations = 8;
    world.integrationParameters.numInternalPgsIterations = 2;
    const bodies = new Map();
    const colliders = new Map();
    const lockedIds = new Set();
    let nextId = 1;
    let remainder = 0;
    // A level serving tray rests directly above the countertop.
    const tray = world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.655, .015, 1.255)
        .setTranslation(0, TRAY_Y, 0)
        .setFriction(.58)
        .setRestitution(.025)
    );
    // The counter catches anything spilled off the tray.
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
          .setTranslation(translation.x || 0, translation.y || 0, 0)
          .setRotation(rotation)
          .setLinvel(movement.x || 0, movement.y || 0, 0)
          .setAngvel({ x: 0, y: 0, z: angular.z || 0 })
          .setLinearDamping(.13)
          .setAngularDamping(.2)
          .enabledRotations(false, false, true)
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
          .setFriction(.68)
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
            shape.setDensity(1.45).setFriction(.68).setRestitution(.02),
            body
          ));
        }
      }

      const id = nextId++;
      bodies.set(id, body);
      colliders.set(id, pieces);
      return id;
    }

    function step(deltaSeconds) {
      remainder += Math.min(Math.max(deltaSeconds || 0, 0), .1);
      let steps = 0;
      while (remainder >= world.timestep && steps < 12) {
        world.step();
        for (const [id, body] of bodies) {
          if (lockedIds.has(id) || body.isSleeping()) continue;
          const pos = body.translation();
          const vel = body.linvel();
          const ang = body.angvel();
          const needZ = Math.abs(pos.z) > 1e-4 || Math.abs(vel.z) > 1e-4;
          const popY = vel.y > 0.55;
          if (needZ || popY) {
            body.setLinvel({
              x: vel.x,
              y: popY ? 0.55 : vel.y,
              z: needZ ? vel.z * 0.45 - pos.z * 14 : vel.z
            }, false);
            if (Math.abs(pos.z) > 0.06) {
              body.setTranslation({ x: pos.x, y: pos.y, z: Math.sign(pos.z) * 0.06 }, false);
            }
          }
          if (Math.abs(ang.z) > 6.5 || Math.abs(ang.x) > 1e-4 || Math.abs(ang.y) > 1e-4) {
            body.setAngvel({ x: 0, y: 0, z: Math.max(-6.5, Math.min(6.5, ang.z)) }, false);
          }
        }
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

    function nudgeNest(id, targetPose, strength) {
      const body = bodies.get(id);
      const current = pose(id);
      if (!body || !current || !targetPose) return;
      const pos = body.translation();
      const vel = body.linvel();
      const ang = body.angvel();
      const s = Math.min(Math.max(strength || 0, 0), 0.35);
      const desiredTilt = Math.max(-0.14, Math.min(0.14, (targetPose.tilt || 0) * 0.45));
      const pullVx = Math.max(-1.6, Math.min(1.6, (targetPose.x - pos.x) * 6.0));
      const pullVz = Math.max(-1.0, Math.min(1.0, -pos.z * 5.0));
      const pullAngZ = Math.max(-2.5, Math.min(2.5, -(desiredTilt - current.tilt) * 6.5));
      body.setLinvel({
        x: vel.x * (1 - s * 0.8) + pullVx * s,
        y: vel.y,
        z: vel.z * (1 - s * 0.85) + pullVz * s
      }, true);
      body.setAngvel({
        x: 0,
        y: 0,
        z: ang.z * (1 - s * 0.8) + pullAngZ * s
      }, true);
    }

    function gripRim(id, strength) {
      const body = bodies.get(id);
      if (!body) return;
      const vel = body.linvel();
      const ang = body.angvel();
      const s = Math.min(Math.max(strength || 0, 0), 0.3);
      body.setLinvel({
        x: vel.x * (1 - s * 0.45),
        y: Math.min(vel.y, 0.25),
        z: vel.z * (1 - s * 0.6)
      }, true);
      body.setAngvel({ x: 0, y: 0, z: ang.z * (1 - s * 0.5) }, true);
    }

    function lockFoundation(placedIds, keepLiveCount) {
      const keepLive = keepLiveCount || 6;
      if (!Array.isArray(placedIds) || placedIds.length <= keepLive + 1) return;
      const limit = placedIds.length - keepLive;
      for (let index = 0; index < limit; index++) {
        const id = placedIds[index];
        if (lockedIds.has(id)) continue;
        const body = bodies.get(id);
        const p = pose(id);
        if (!body || !p) break;
        const upright = Math.abs(p.tilt) < 0.75
          && Math.abs(p.x) < 2.6
          && Math.hypot(p.vx, p.vy, p.vz) < 0.25
          && p.angularSpeed < 0.35;
        const supported = index === 0
          ? touchesTray(id)
          : (lockedIds.has(placedIds[index - 1]) || touches(id, placedIds[index - 1]));
        if (!upright || !supported) break;
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
        lockedIds.add(id);
      }
    }

    function isLocked(id) {
      return lockedIds.has(id);
    }

    function calmStack(ids, factor) {
      if (!Array.isArray(ids) || !ids.length) return;
      const damp = Math.min(Math.max(factor || 0.72, 0.3), 1);
      const recent = ids.slice(-3);
      for (const id of recent) {
        const body = bodies.get(id);
        if (!body || lockedIds.has(id)) continue;
        const vel = body.linvel();
        const ang = body.angvel();
        body.setLinvel({ x: vel.x * damp, y: vel.y * damp, z: vel.z * damp }, true);
        body.setAngvel({ x: 0, y: 0, z: ang.z * damp }, true);
      }
    }

    function destroy() {
      bodies.clear();
      colliders.clear();
      lockedIds.clear();
      world.free();
    }

    return {
      spawnBowl, step, pose, touches, touchesTray, touchesFloor,
      nudgeNest, gripRim, calmStack, lockFoundation, isLocked, destroy
    };
  }

  window.createBowlPhysics = createBowlPhysics;
})();
