# Security Specification - Solgram

## Data Invariants
- A report must have a valid date (YYYY-MM-DD), a supervisor, and a WBS.
- Reports and extra hours entries must have valid HH values (non-negative).
- Only administrators can delete or change the status of reports.
- Project configuration (schedule/personnel) can only be updated by admins.

## The Dirty Dozen Payloads (Rejection Tests)
1. **Shadow Field Injection**: `{"date": "2024-01-01", "sup": "John", "wbs": "WBS1", "tipo": "Work", "isAdmin": true}` -> REJECT (isAdmin not in schema)
2. **Negative Hours**: `{"date": "2024-01-01", "hours": -5}` -> REJECT
3. **Invalid ID Junk**: `reports/!!!bad-id!!!` -> REJECT
4. **Unauthenticated Write**: Deny all writes if `request.auth == null`.
5. **Unauthorized Status Change**: Worker trying to change status to `listo`.
6. **Self-Promotion**: Worker trying to write to `/admins/$(uid)`.
7. **Junk String ID**: Path variable > 128 chars.
8. **Invalid Data Type**: `hours: "ten"` instead of `number`.
9. **Missing Required Field**: `reports` without `date`.
10. **Resource Exhaustion**: 1MB string in `detalle`.
11. **Orfaned Update**: Changing `wbs` of an existing report (if immutable).
12. **Future Timestamp Spoof**: `updatedAt` set to a future date by client.

## Test Runner Plan
- Verify `rules_version = '2'`.
- Verify `isValidId` on all path variables.
- Verify `isAdmin` check for sensitive paths.
