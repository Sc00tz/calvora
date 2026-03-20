# Calvora

A premium, self-hosted web calendar application that provides a modern, responsive interface for your CalDAV and CardDAV data. Designed for those who prioritize privacy and data ownership, Calvora acts as a powerful frontend for the [Davis](https://github.com/tchapi/davis) server.

## 🚀 Why Calvora?

In a world of data-hungry corporate silos, Calvora gives you back control. It doesn't store your data; it provides a beautiful lens through which you interact with your own self-hosted Davis server.

### Key Features
- **Full Calendar Suite**: Smooth navigation between Month, Week, and Day views powered by FullCalendar.
- **Task Management**: Fully integrated support for `VTODO` tasks, synced directly from your Davis server.
- **Contact Birthdays & Anniversaries**: A "set it and forget it" virtual calendar that automatically surfaces important dates from your CardDAV address books.
- **iCal Subscriptions**: Subscribe to external calendars (like Holidays or sports schedules) and see them listed alongside your personal calendars.
- **Modern Tech Stack**: Built with React, TypeScript, Node.js, and styled with a premium Tailwind CSS design system.
- **Mobile Friendly**: Designed to work beautifully on both desktop and mobile browsers.

## 📊 Calvora vs. The Giants

| Feature | **Calvora** | **Google Calendar** |
| :--- | :--- | :--- |
| **Data Ownership** | **You own it.** Self-hosted on your hardware. | Google owns the cloud storage. |
| **Privacy** | **Zero tracking.** No ads, no profiling. | Data is used for ad profiling. |
| **Protocols** | Open Standards (CalDAV / CardDAV) | Proprietary (with limited API) |
| **Sync Ecosystem** | Native support (iOS, Android via DAVx⁵) | Proprietary App Required |
| **Task Integration** | Unified VTODO support | Google Tasks (separate service) |
| **Birthdays** | Auto-detected from local CardDAV | Scraped from Google Contacts |
| **Customization** | Full control over the codebase | Restricted to theme settings |

## 🛡️ The Power of Self-Hosting

Calvora is built on the philosophy that **personal data should remain personal**. By self-hosting with Davis and Calvora:
1. **Security**: Your calendar and contacts are not stored on a third-party server.
2. **Durability**: Your service won't disappear if a provider decides to sun-set a product.
3. **Interoperability**: Any app that supports CalDAV (Thunderbird, Apple Calendar, DAVx⁵) works seamlessly with the same data.

## 🛠️ Getting Started

### Prerequisites
- A running [Davis](https://github.com/tchapi/davis) server.
- Docker and Docker Compose installed.

### Installation

1. Clone the repository to your server.
2. Configure your environment variables in `docker-compose.yml`:
   - `DAVIS_BASE_URL`: The internal or external URL of your Davis `/dav` endpoint.
   - `SESSION_SECRET`: A random 32-character string for securing your login sessions.
3. Launch the stack:
   ```bash
   docker-compose up -d
   ```
4. Access the UI at `http://localhost:8092` (or your configured port).

## 💻 Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express + `tsdav`
- **Data Engine**: `ical.js` for non-destructive vCard/iCal parsing.
- **Deployment**: Docker-ready.

---
*Built with ❤️ for the self-hosting community.*