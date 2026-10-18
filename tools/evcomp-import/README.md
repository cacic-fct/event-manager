# EvComp JSON export

Export the legacy EvComp database into files accepted by the administrative
**Dados JSON** feature. Export mode does not connect to the target database or
apply an import.

```sh
node tools/evcomp-import/index.mjs \
  --source-sql /path/to/evcomp.sql \
  --source-namespace evcomp \
  --export-json /path/to/new-export-directory
```

SQL dumps may also be gzip compressed. For a running source MySQL database, set
`EVCOMP_DATABASE_URL` and omit `--source-sql`. Source table/column overrides and
explicit target mappings can be supplied with `--config`; see
`config.example.json`. `EVCOMP_TIMEZONE_OFFSET` defaults to `-03:00` and applies
to legacy dates without an offset. Run from the repository with its development
dependencies installed; export validation loads the actual shared TypeScript
schema through the existing SWC dependency.

The output directory must not exist. It is created with private permissions;
the files contain personal information and should remain outside Git. Export
files are validated before publication against the same schema and JSON checks
used by the application, including the 500-resource and 5 MiB limits.

Import the numbered data files **in manifest order**, applying each before
previewing the next. `event-data.schema.json` documents the format;
`manifest.json` describes counts, skipped rows, and unsupported records. These
two reference files must not be uploaded as data imports. Review every preview
and resolve its participant prompts. Catalog records are created as drafts using
the destination application's defaults.

The export uses deterministic concrete UUIDs rather than document-local keys so
relationships survive file boundaries. Keep the namespace stable for repeated
exports of the same source. Use a different namespace for an independent EvComp
database whose numeric IDs may overlap. Reimporting catalog files can update
previously imported records; review the changes before applying them. Existing
records with different IDs can be reused through explicit mappings.

## Coverage and limitations

### SECOMPP26 source rules

JSON export automatically applies these rules when the matching source events
are present:

- **Evento de Teste** and its activities, modalities, registrations, attendance,
  lecturer assignments, and payments are excluded. Participants referenced only
  by that event do not appear in the output.
- **After da SECOMPP26** becomes a ticketed child event of
  **SECOMPP 2026 - Semana da Computação de Presidente Prudente**. Its single
  activity supplies the schedule and location; its modality supplies the ticket
  price. The After is not exported as a separate major event or main-event tier.
- Existing main registrations keep their original tier, status, paid amount,
  and activity choices. An After purchase never creates or confirms a main-event
  registration. The ticket configuration requires no main registration and
  disables ticket issuance from either type of subscription. Public checkout
  remains disabled; this configuration supports importing historical rights.
  Any source selection of the After activity inside another event's registration
  is removed and counted in `removedActivitySelections`; it cannot grant an
  After event subscription or substitute for an approved purchase.
- Only active After registrations with approved payment evidence (or confirmed
  exemption) become `ticket-purchase` resources. Each purchase issues its own
  ticket through the importer. Pending, refused, or unverifiable payments are
  listed for manual review without granting tickets. No separate `event-ticket`
  resource is emitted for the same purchase.
- Purchases preserve the source After registration timestamp as `purchasedAt`
  and the historical applied amount in cents. The timestamp must be valid, in
  the past, and before ticket expiration. Main-event registration dates remain
  outside the transfer format.
- Importing these purchases also requires scoped ticket issue and receipt
  approval permissions, in addition to the event, ticket, receipt, and transfer
  read/import permissions checked by the destination.
- Main registrations are placed in earlier files than After purchases. This
  boundary is intentional: the backend applies purchase adapters before
  subscription adapters inside one file. Apply the numbered files in order.
  The ticket configuration and its price option also stay together, as do price
  tables and their first tier. Export stops if custom file limits cannot fit
  these pairs.

The manifest's `rules` section reports excluded test data and After buyers with
confirmed, unconfirmed, or absent main registrations. These rules require an
unambiguous main event and exactly one After activity and modality. Export stops
before publishing files when those assumptions do not hold. Explicit catalog
mappings for this conversion also stop for manual review; people mappings are
still supported. These files supersede earlier exports that represented After
as a major event. Existing imported records cannot be reparented by JSON, so
previously applied After catalogs need a separate reconciliation.

### General mapping

- EvComp events become major events; activities become child events. Dates,
  descriptions, locations, capacities, workload minutes, and registration windows
  are preserved. Modalities become price tiers with integer cent amounts.
- Registrations become major-event subscriptions with their selected activities.
  Confirmed registrations create corresponding event subscriptions. Inactive
  registrations with a known pending or refused payment remain awaiting receipt,
  under review, or rejected; their choices are retained without granting active
  event subscriptions. Inactive registrations whose state cannot be established
  are reported and skipped.
- Approved payment records provide evidence for `amountPaid`; exempt records
  use zero. An applied price alone is not evidence of payment. Approval/upload
  timestamps are not asserted to be payment dates.
- Present and absent attendance records preserve their recorded timestamp.
  The destination recalculates attendance eligibility using its current rules.
- Participants' full names, email addresses, and available academic IDs are
  embedded in their registrations and attendance. Dados JSON can match existing
  people or prompt you to create missing people, merge candidates, or skip their
  records. Creating people requires global `Person.Read` and `Person.Create`;
  merging requires `Person.Read` and `Person.Update`. Resolve every prompt before
  applying. No separate person resource or pre-approved creation decision is
  emitted. Names and identifiers stay consistent across files, so subsequent
  files can match people created by earlier imports.
- Creating a missing person requires a full name and another valid identifier.
  Incomplete source data is retained where valid for matching and reported for
  review; the exporter never invents a name or identifier. Explicit
  `personMappings` remain ID-only references to existing people. The manifest's
  `personSummary` describes the referenced participants and creation-ready data;
  it does not claim how many people will actually be created in the destination.
  Matching checks all supplied fields, including the name. If the destination
  has a different spelling despite matching email or academic ID, review the
  skipped record and provide an explicit person mapping when appropriate.
  Only people referenced by supported participation records are included. The
  export does not copy passwords, secret seeds, or authentication accounts.
- Lecturer links, attendance collector permissions, receipt blobs/files,
  payment review history, and already issued certificate documents are outside
  the current transfer schema. They require separate handling. Event accounting
  mode, Pix keys, activity prerequisites, modality descriptions/visibility, and
  lecturer-specific workload also have no equivalent fields in this export.
- The export does not infer image-license consent, publication state, event
  classification, certificate templates, or source administrative permissions.

`--export-json <directory>` is required. The tool only reads the EvComp source
and writes validated transfer files to a new output directory. `--apply` and
`--report` are no longer supported. The export report is included in
`manifest.json`.

## Verification

```sh
node --test tools/evcomp-import/*.test.mjs
bunx eslint tools/evcomp-import/*.mjs
```
