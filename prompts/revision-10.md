Review the pixel-canvas-engine.js library for DRY optimizations and increased code clarity.
Produce the fully refactored file with all fixes applied.
Add a sysEnemy pattern (state machine: idle, patrol, chase, attack) using the new helpers.
Add a ranged enemy variant with a projectile weapon def and show a usage example.
Implement an enemy spawner component that respawns enemies on a timer when their flagName is unset.
Add an aggro table so multiple enemies can share chase state when one is alerted (alarm propagation).
Implement a simple line-of-sight check using the collision layer to gate alertRange — enemies only spot the player if no solid tiles block the vector.
Implement a "lost-sight" timer in the chase state — enemies give up if they haven't had LOS to the player for N seconds.