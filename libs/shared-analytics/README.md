# Shared analytics

Defines the website IDs, event names and aggregate report contract shared by the Event Manager frontends and backend.

## Using the Umami dashboards

In Event Manager, grant `usage-metrics#read` globally to staff who need the seven-day report in **Métricas de uso**. Its dashboard links use the authenticated Umami UI. Grant access to the relevant websites separately in Umami. Set `UMAMI_DASHBOARD_BASE_URL` if the UI runs at a different address.

In the public website dashboard, use **Events → Properties** to break down calendar searches by result and data source, registration by flow and payment mode, and action failures by step and error category. Browser events use the Account Manager preference and send only the allowlisted event properties.

In **Funnels** on the public website, use `major_event_registration_attempted` → `major_event_registration_saved` to examine submission drop-off. For tickets, use `ticket_checkout_started` → `ticket_receipt_submitted`. Staff approval and rejection events are recorded on the admin website, where they can be compared as counts.

The infrastructure website records backend readiness transitions and scheduled calendar maintenance outcomes when `UMAMI_OPERATIONS_WEBSITE_ID` and `UMAMI_API_BASE_URL` are set.
