'use client';

import FacultyProfile from '../../profile/page';

// Reuse the existing task data/actions while rendering only the selected
// task section on this dedicated route (the profile dashboard is hidden).
export default function TaskManagementSectionPage() {
  return <FacultyProfile />;
}
