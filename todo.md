() Add feature: show mod updates when available with a orange hue in installed mods.
() Add feature: disable/completely hide ui when game launched to lower cpu use when game running. The only thing alive would be the ping that checks if game is closed yet or not.
() Improve: Brainstorm idea to make project smaller and optimized, since moving to C is a lot of work and might be overkill for this project. (consider rewriting to C, or at least C# to reduce overhead)
(x) Improve: Load times. Perhaps move to Tauri?
() Make Wiki, Readme, and other documentation.
() Add License. 
() Improve: mod applying. Factorio loads each mod even if disabled, bypass by symlinking a custom mod folder and dynamically cut pasting the mod zip files when selecting profiles, with a cache folder if directories in different disks.
() Implement Config editing UI. Need to brainstorm idea on how to make ingame config editing via the Mod Manager UI. (Make the UI nice and compact, using tabs for each mod that has config, and allow nested grouping of config)
() Implement Settings page for the Mod Manager itself, and add a Settings that scales the UI based on monitor DPI and other user choice (slider). Think of other Settings.
() Currently we are just copying sounds from Factorio in codebase itself. This will cause issues in future. How to fix? Map the soundnames in codebase to the sounds that we are grabbing from Factorio Directory. When user downloads, during first load ask for game path, and also provide auto detect from steam option. When provided, game auto fetches the sounds in local instance. And then restarts. Now sounds will be availabe and we can safely remove them from the codebase. This also removes the possibilty of backlash from factorio devs for using their game sounds directly.