Add a camera/viewport system: define a world larger than the screen and scroll it by offsetting blit coordinates — explain culling.

Add a sprite animation system: define named animations as frame sequences with per-frame durations, and attach them to entities.

Add a collision layer to the tilemap: mark tiles as solid and implement AABB collision resolution for the player entity.

Add a simple entity/component system to manage multiple moving objects without per-entity hardcoded render and update logic.