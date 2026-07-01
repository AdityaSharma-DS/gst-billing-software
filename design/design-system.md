# GST Billing — Design System (extracted from Figma)

Source: [Figma — GST Billing Software UI Design System](https://www.figma.com/design/az3PhVzLLpi1Y6XUXQxnit/GST-Billing-Software-%E2%80%94-UI-Design-System?node-id=0-1)
Extracted via Figma MCP `get_metadata` (page `0:1 🎨 Design System`).

> **Exact vs. approximate:** Values marked ✅ are read directly from the Figma file.
> Values marked ⚠️ are derived/approximate because per-shade hex for the base palettes
> lives in fill properties not exposed by metadata — confirm these from the Figma
> Colors frame (`14:152`) when the MCP is connected (select the swatch, run
> `get_design_context`).

## Typography ✅
- **Font family:** Poppins
- **Weights:** Medium (500), SemiBold (600), Bold (700)
- Scale present in file: Headlines (H1…), Text, Buttons (exact px sizes to confirm from `13:140`).

## Spacing ✅
- Base unit: **4px**
- Scale: `4, 8, 12, 16, 24, 32, 40, 48, 56` (px)

## Color — Bill status tokens ✅ (frame `13:142 token`)
"Semantic colors for GST Billing Software — bill states, alerts, and UI surfaces"

| Token | Meaning | BG | Text |
|-------|---------|----|------|
| `status-draft` | Unsubmitted bill | `#F1EFE8` | `#5F5E5A` |
| `status-approved` | Approved, not yet filed | `#E6F1FB` | `#185FA5` |
| `status-verified` | Verified by senior | `#EEEDFE` | `#534AB7` |
| `status-finalized` | Locked & ready | `#E1F5EE` | `#0F6E56` |
| `status-filed` | Filed with GSTN | `#EAF3DE` | `#3B6D11` |
| `status-overdue` | Past due date | `#FCEBEB` | `#A32D2D` |
| `status-pending` | Action required | `#FAEEDA` | `#854F0B` |
| `itc-blocked` | Sec 17(5) blocked | `#FAECE7` | `#993C1D` |

## Color — Base palettes (frame `14:152 Colors`)
Palettes defined, each with shades 50–900, plus Black (alpha 10–100%), White, Border, Divider:
- **Primary** ⚠️ (brand) — anchored near the Info/Approved blue `#185FA5`
- **Grey** ⚠️ — warm neutral (draft bg `#F1EFE8`, draft text `#5F5E5A`)
- **Green / Success** ⚠️ — near `#0F6E56`
- **Red / Danger** ⚠️ — near `#A32D2D`
- **Yellow / Warning** ⚠️ — near `#854F0B`
- **Blue / Info** ⚠️ — near `#185FA5`

## Components (present in file)
| Component | Node | Variants |
|-----------|------|----------|
| Button | `13:1236` | Type: Primary/Secondary/Tertiary · Size: X-Large/Large/Medium/Small · State: Default/Pressed/Disabled · Theme: Rounded/Rectangular |
| Input | `14:8760` | Style: Outline/Filled · Size: Large/Medium · State: Default/Filled/Hover/Focus/Disabled/Success/Info/Warning/Error |
| Alert | `14:482` | 5 variants |
| Pop-Up | `14:1524` | 12 variants |
| Stepper | `14:1748` | |
| Pagination | `14:1769` | |
| Badge & Chip | `14:8443` | |
| Avatars | `13:1336` | |
| Filter/Sort | `13:255` | |
| Icons | `14:1819` | 47 icons |
| Login (screen) | `15:13570` | full screen layout |

## Implementation
Tokens are implemented in `apps/web/src/styles/tokens.css` and consumed by
`apps/web/src/styles.css`. Bill-status badges use the exact tokens above.
