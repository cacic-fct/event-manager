export const MCP_ADMIN_PROPOSAL_TOOLS = [
  'propose_event_description_change',
  'propose_event_content_change',
  'propose_event_location_change',
  'propose_event_preparation_change',
  'propose_event_livestream_change',
  'get_proposal_status',
] as const;
export const MCP_ADMIN_TOOL_NAMES = [
  'list_delegations',
  'list_events',
  'get_event',
  'get_attendance_summary',
  ...MCP_ADMIN_PROPOSAL_TOOLS,
  'get_workspace_summary',
  'get_event_preparation',
  'get_event_materials',
  'get_registration_summary',
  'list_event_forms',
  'get_event_content_review',
] as const;
