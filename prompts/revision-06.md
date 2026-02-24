Modify the pixel-canvas-engine.js library to add the following features:
Add a chest entity type: interactable via Z, plays open animation, drops configurable loot.
Add a minimap rendered in a corner of the HUD (lower right, by default, but configurable) using downsampled collision layer data.
Update the status bar logic so that the game world does not overlap.  Currently, the world is rendered underneath the status bar, allowing tiles and sprites to be covered up by the status bar graphics.
Add the ability to select items from the status bar inventory, changing what happens when the user hits the action key with an item selected.
Update the pixel-canvas-zelda.html example to demonstrate these additions.
