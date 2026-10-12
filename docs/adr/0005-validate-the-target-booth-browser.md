# Validate the target booth browser on hardware

## Original decision

Bluefy on the iPad A16 is the first release's target browser because it exposes Web Bluetooth on iPad, but direct Mini Link 3 printing and continuous fullscreen camera operation are not yet proven together. Before building the full Admin and print-accounting flows, a target-device trial must demonstrate restricted navigation, continuous preview and Bluetooth access, three consecutive Guest Sessions, a Retake, exhausted allowance handling, printer disconnect recovery, and reliable detection of film ejection. Browser printing is isolated behind an adapter so simulated printer tests can check application behavior, while only the real target-device trial can establish hardware support. If the trial fails, the printing or booth browser approach must be reconsidered before release.

## Current status

[ADR-0012](0012-qualify-development-on-iphone-before-ipad-launch.md) supersedes this decision's requirement to finish the iPad trial **before the full build**: a passed fresh-film iPhone trial may now unlock integrated development. The iPad trial remains mandatory **before first-release launch**; iPhone evidence cannot establish iPad support. The printer-adapter boundary still applies.
