export const BERN_TICKET_GUIDE_SLUG = 'bern-ticket-instructions';

export const bernTicketGuideMarkdown = `# Instructions for the Bern Ticket

This guide explains how to use [bernticket.com](https://bernticket.com) to create, import, edit, and print Bern Tickets for guests.

## Accessing the website

BernTicket is managed via a website, which can be accessed at [bernticket.com](https://bernticket.com) or [bernticket.com/login](https://bernticket.com/login).

Simply enter **bernticket.com** in the search bar of any browser to access the correct website.

You can also save this website as a bookmark to make it easier to access.

## Logging in

Once you have opened the website in your browser, you will see a window for logging in.

### Email

In the email field, enter your company email address, for example:

\`name.nachname@prizebyradisson.com\`

### Password

The password is the password for the BernTicket website.

> **Important:** This is **not** the password for EMMA or your Radisson account. It is a randomly generated password that is set when the user account is created. If you do not yet have a password, ask Martin for your password.

If you no longer know your password, contact a user who has the permissions to reset it. It is not possible to reset or change the password yourself.

## Navigation

Once you are logged in, you will be taken to the BernTicket website dashboard.

On the dashboard, you can view general statistics from the BernTicket website. To create or import Bern tickets, click on the respective categories at the top of the navigation bar.

### Dashboard

This is where you can view general information about the BernTicket website.

### Tickets

You can manage all created tickets using the **Tickets** category. See [BernTicket list](#bernticket-list) below.

### New ticket

In the **Neues Ticket** category, you can manually create a new Bern Ticket. See [Creating BernTickets manually](#creating-berntickets-manually).

### Import

In the **Import** category, you can create multiple tickets at once using the EMMA arrival list. See [Importing BernTickets](#importing-berntickets).

### White/dark mode

At the top right of the page, there is a moon/sun icon that allows you to switch between white and dark mode.

### User account

To the right of this is a field that shows which account you are currently logged in with. Clicking on it displays your email address and gives you the option to log out.

## BernTicket list

After clicking on **Tickets** in the navigation bar at the top, a list of all tickets opens with a search bar.

### Search BernTickets

In the search bar, you can find any BernTicket you have created so far by entering:

- Guest name
- Booking / OTA number
- Activation code

You can also filter by status (**created** / **printed** / **imported** / **cancelled**) or search only within a specific time range.

## Edit BernTickets

Once you have found the ticket you want to edit in the list, click the **Edit** button on the right.

Clicking this button opens a menu displaying the previous data for this ticket.

For example, to change the number of activatable tickets, replace the number with the new number.

> **Important:** Simply pressing Escape or closing the page does **not** save the updated information — you must click **Speichern** for the changes to take effect.

- **Increasing** the number of tickets is no problem.
- If you **reduce** the number and tickets have already been redeemed with the activation code, the surplus tickets must be canceled.
- Adjusting the **validity period** is fine if the guest has not yet redeemed the tickets. Otherwise, inform the guest — they will need to redeem again with the same activation code and re-enter their data.
- The **ticket type** can only be adjusted if no ticket has been redeemed yet.

## Print BernTickets

To print a BernTicket, first find the ticket using the **Tickets** list. There you will find the option to download the BernTicket as a PDF.

When you click this button, a window opens where you must enter the guest's details (which the guest would otherwise enter themselves at [Activation - Bern Welcome](https://activation.bernwelcome.ch)):

- First and last name as it appears on the ID document
- Guest's date of birth

A PDF file will then download, which you can print as normal.

> **Important:** If the BernTicket is edited, it must be printed out again! If the guest already has and is using a printed ticket, it must **not** be edited — otherwise the ticket will be invalidated for the guest.

## Creating BernTickets manually

BernTickets can be created manually in the **New Ticket** category.

### Enter information

After opening this category, you will see a window with several empty fields. Enter:

| Field | Description |
| --- | --- |
| Guest name | Guest's name |
| Booking number | From EMMA or the OTA number (voucher code) |
| Validity period | Start and end dates |

By default, today's and tomorrow's dates are entered for the validity period — adjust these for other dates.

The **number of tickets** field specifies the maximum number of BernTickets that the respective person can activate with the activation code — **not** how many BernTickets are created.

After entering all the information, click **Ticket erstellen** to finalize the BernTicket.

### Check BernTicket creation

After creating the BernTicket, a confirmation appears with the exact data and activation code (displayed large at the top on a normal ticket; can be copied directly).

You can also print the BernTicket directly by clicking **PDF herunterladen** in the menu at the top right and then entering the relevant guest details.

This menu can also be opened again at any time via the ticket list by clicking on the ticket name.

> **Important:** All manually created tickets are automatically **single tickets**. For group tickets, please use the import function.

## Importing BernTickets

To import BernTickets, click on the **Import** category. There you will find the option to upload an Excel file.

### Upload

The Excel file you should upload is the **arrival list for the current day from EMMA**. You do not need to convert anything before uploading.

Below that, there is an option to change the ticket types. This option is set to **single tickets** by default.

### Group tickets

Group tickets should only be created if:

- A large group is arriving
- You are sure they will always travel together
- They agree that only one person can/must activate the ticket on their cell phone

If this is the case, the import must be done **separately** for the group. Delete all lines for guests who are not part of the group from the arrival list.

### Individual tickets

Individual tickets are the standard case. Simply upload the arrival list and press **Importieren**.

At the bottom of the page, you will find the previous imports, showing when the last import took place, how many tickets were imported, and who performed the import. On the right, **Liste öffnen** displays all tickets created during that import.

## BernTicket extension

### Download extension

To download the BernTicket extension, log in to [bernticket.com](https://bernticket.com) and click on the **Extension** category. There you will find the option to download the \`.zip\` file. Further installation steps are described in that category.

### Display activation code

Since BernTickets can no longer be activated with the booking number as of **February 25, 2026**, there is a randomly generated activation code for each BernTicket.

The extension automatically displays the activation code of the BernTicket for the guest in EMMA. It also shows:

- How long the ticket is valid
- How many people it is valid for
- Whether a BernTicket has been created for this booking

### Create BernTicket (extension)

It is also possible to create a BernTicket for the respective booking directly via the extension. This saves the steps via the BernTicket website.

The extension shows a button only if there is no ticket for the booking yet. Click it and a ticket with the relevant data will be created; the activation code is then displayed automatically. The ticket can also be found on the BernTicket website.

## Important information

Since every user now has their own access to BernTicket, it is possible to track exactly who created, imported, or edited which ticket and when.

Everyone has their own password, which cannot be changed by the user.

> **Important:** This is **not** the password for EMMA or any other hotel software. It is a randomly generated password with at least 8 characters, received either by email or on paper.

If you lock your account by entering the wrong password **5 times**, another person with permission to manage your account must unlock it again.
`;

export const bernTicketGuideSummary =
  'How to log in to bernticket.com, create and import Bern Tickets from EMMA, print PDFs, edit tickets, and use the browser extension.';
