Extend this template with a palette system: define a COLOR_PALETTE array and reference indices in sprite data instead of inline hex strings.

Add a tilemap layer system: define a 2D array of sprite names or IDs and render the full map in one drawTilemap() call.

Replace per-pixel fillRect rendering with ImageData for bulk sprite blitting — explain the performance tradeoffs.

Add an input handler (keyboard + gamepad) that integrates cleanly with the game loop pattern shown.