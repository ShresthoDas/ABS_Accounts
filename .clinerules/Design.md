# ABS Accounts - Design Pattern Documentation

## Architecture Pattern
This project uses Next.js 14 App Router with Firebase Realtime Database.

### Page Types & Patterns

#### 1. Tracker/Form Page (Create)
**Files:** `src/app/{entity}-tracker/page.tsx`

Pattern:
- `"use client"` directive
- Imports: AuthContext, ProtectedRoute, getUserDoc, Firebase db, constants
- `roundMoney()` helper function for all monetary calculations
- Form state with individual `useState` for each field
- Validation with `errors` state object
- `handleSubmit` creates record in Firebase, generates receipt PDF, creates income record with `incomeKey` link
- Uses `push(ref(db, dbPath.{entity}(currentYear)))` for unique keys
- Logs audit with `logAudit()`
- Access control with `hasAccess(userData.userType)`
- ProtectedRoute wrapper

#### 2. List Page (Read)
**Files:** `src/app/{entity}-list/page.tsx`

Pattern:
- Fetches all records from `dbPath.{entity}(currentYear)`
- Maps snapshot to array with `key` field
- Sorts by date descending
- Table display with sortable columns
- Click row navigates to `/{entity}-list/[key]`
- Footer with total sums for amount columns
- Refresh button
- New entry button navigating to tracker

#### 3. Detail/Edit/Delete Page
**Files:** `src/app/{entity}-list/[id]/page.tsx`

Pattern:
- Fetches single record by `params.id`
- Two views: Detail View (default) and Edit Form (when editing)
- Edit button toggles `isEditing` state
- Delete button shows confirmation modal
- Edit flow: Update record + handle income record changes (create/update/delete income based on paid amount changes)
- Delete flow: Remove linked income record, adjust total income, delete main record
- Audit logging on both edit and delete
- `validateEditForm()` function for edit validation

### Database Path Convention
`UAT/Accounts/{year}/{EntityName}`

### Constants Structure (src/utils/constants.ts)
- `DB_PATHS` - Database section names
- `dbPath` - Helper functions for building paths
- `ROUTES` - All route paths
- `{ENTITY}_TYPES` - Type options arrays with `{ value, label }`
- `DEFAULTS` - Default values including income categories

### Monetary Calculations
- Always use `Math.round(value * 100) / 100` for rounding to 2 decimal places
- All amounts stored as numbers, not strings

### Income Linking
- When paid > 0, creates income record linked via `{entity}Link: recordKey`
- Stores `incomeKey` on the entity record
- On edit/delete, adjusts both income record and total income counter
- Records cannot be deleted from income list screen (income records are managed only from source entity)