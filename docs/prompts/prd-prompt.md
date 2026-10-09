Let's make a product requirement document. Store it in [PRD.md](http://PRD.md).



DIY-INSTAX-PHOTOBOOTH is a website-based photo booth system for Special Events. That uses instax mini link 3 to print captured photos. The application will be using iPad a16 as the main booth device to setup the booth, captures photos, and send print command to the instax printer to print the image. The system will be using Web-bluetooth to connect to the printer, and will be using Bluefy browser if Safari/Chrome is not available for the device to connect to the printer using Web-bluetooth.



Terms:

Event - the special event that booked our photo booth system. Booking is outside of the system.

Film packages - the number of films package booked for the instax printer. In other words, how many prints are available and booked for the event. ‘In package’ means there are total amount of print films for each package.

Extra captures - the number of extra films requested by the client.

Booth Device - iPad a16 is the main device that will be used as the camera, and the device that will be used by the admin to run the system, and sign-in as the admin.

Instax mini link 3 - the printer device that will print images sent by the system.
Booth Mode - this is the Photo Booth mode where guests from the events are able to use.

Admin - Owner of the system.

Guests - Guests for each special event.



Main features for Admin routes:

The website application/system was designed for a single Admin user.

Authentication:

- Only the admin are able to log in.
- There is no public sign-up for public users.
- The way we can create an Admin account is by directly creating an Admin user in Supabase Postgres.
- The admin should authenticate using email address and a secure password. We can optionally add 2FA for more security.


AppShell:

- The admin should be able to navigate to admin pages using the AppShell or sidebar. Dashboard, Events, History, and Profile (at the bottom of the sidebar) are included here.
- The AppShell is a reusable component for admin page routes that’s listed in the AppShell.


Dashboard:

- The admin needs a Dashboard to summarise metrics the total number of events monthly, Upcoming events, and the next event.
- The admin wants to see Dashboard Graphs, keep it scannable. Use KPI cards at the top + sparkline: a detailed charts below. The chart should be interactable by the Admin by having filters for 3 months, 30 days, 7 days summaries.
- The admin wants a table that lists important activities, such as creating an event. It should list creating event, deleting event, uploading background image for User Interface per event, uploading short montage for events, photo captures when using booth mode.
- It should have filters as well for 30 days and 7 days summary. Use Pagination to allow the admin to load more activities in the web app. Do not load all activities at once, use pagination.

- The dashboard page route should be `/dashboard`



Events:

- The admin needs an Events page to visually see the list of events that are already Past, Upcoming, and the next event.
- The event list should have options to be listed as vertically stacked list, or as rectangular cards almost similar to (Grid). The individual events are clickable thats lead to the `/events/[eventId]` route for that specific event. This is the point before the Admin starts the ‘Booth Mode’ made for that specific event.
- The admin should be able to create new events that leads to ‘/events/new’ route. It asks for required information: Event’s name, client’s email address and phone number, venue address, date-time of the event, and the number of film packages booked.

- The events page route should be `/events`.



Specific Event:

- The admin needs to see the Event’s name as the main title.
- The admin needs to see the client’s email address and phone number.
- The admin needs to see the venue address and the date-time of the event.
- The admin needs to see the total film packages booked.
- The admin needs to upload a background UI to setup the event for the Booth Mode interface. The background UI for Booth Mode interface should have a proper format design.
- The admin needs to upload short montage video clip as the first landing page after the Booth Mode starts. It should have ‘Start’ text and its surroundings should be clickable to start photo taking.
- The admin needs to configure the iPad a16 camera and ensure that camera connection will continue to work throughout the event.
- The admin needs to setup the application’s connection to the instax mini link 3 printer and ensure that the system and instax will communicate well throughout the event. Do this by print testing before the admin approves that the printer is configured and ready.
- The system and the admin should ensure that internet connection is always connected.
- The admin and the system should ensure that the instax printer are connected to continuous power.


- The specific event page route should be `/events/[eventId]`.



Booth Mode (Core feature):

- When Booth Mode started, the system should automatically use full-screen to cover all parts of the screen in the booth device.
- After Booth Mode has started, the admin should automatically signed out. The screen should be locked, so that Guests that are using the booth won’t accidentally leave the Booth Mode.
- The admin should know how to leave the Booth Mode, and when leaving, the Admin should need to sign-in again for more security. It prevent Guests from going to the Admin routes.



Here’s the flow for the Booth Mode:


(0) (At the ‘/events/\[eventId\]’ route) -&gt; (1) Presses ‘Starts Booth Mode’ at the `/events/[eventId]` page -&gt; (2) Enters the Booth Mode and shows the montage clip at the first landing page -&gt; (3) Guests then takes over -&gt; (4) Guests watches the montage and presses the surroundings of the text ‘Start’ anytime they want without needing to finish the montage -&gt; (5) Guests navigates to the photo taking screen -&gt; (6) Guests presses Take Photo and starts the countdown (3 - 2 - 1) -&gt; (7) Guests were given an option to ‘Retake’ or ‘Print’ the photo -&gt; (8) If ‘Retake’ Go to (5) again. (8) Else if ‘Print’ -&gt; (9) Send print command to instax and print the image, wait until printed -&gt; (10) After printing, the system navigates back to (1).


History:

- The admin also wants a simple summary for the total number of events booked, total images captured.
- The admin wants to see a table that lists important informations from all the events and the clients that books it. Including the event name, number of film packages booked and extra films and captures requested by the client, name of the client, venue address for the event, email address of the client, phone number of the client, date of the event.

- The history page route should be `/history`


Profile:

- The admin wants a profile page, no profile picture is necessary. Email address used, phone number, user preferences for light and dark mode.

- The profile page route should be ‘/profile’
