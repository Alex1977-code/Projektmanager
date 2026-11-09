import { localRequest } from './backend';

/** Leerer Start: Büro-Grundeinstellungen speichern, damit der Bestand nicht mehr als „leer“ gilt. */
export async function setSettingsFirstRun() {
  await localRequest('PUT', '/api/settings', { companyName: 'Ingenieurbüro' });
  await localRequest('POST', '/api/employees', { name: 'Administrator', short: 'ADM', role: 'Projektleiter', department: 'Geschäftsführung', weeklyHours: 40, hourlyRate: 100, appRole: 'admin', vacationDays: 30 });
}
