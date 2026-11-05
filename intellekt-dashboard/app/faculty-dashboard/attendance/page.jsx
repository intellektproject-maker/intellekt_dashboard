"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AttendanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  return (
    <div className="p-6 md:p-10 min-h-[80vh] bg-gray-50">
      {/* Heading */}
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Attendance Management
      </h1>

      {/* Regular Batch attendance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          onClick={() =>
            router.push(`/faculty-dashboard/enter-attendance?id=${facultyId}`)
          }
          className="cursor-pointer p-6 bg-white shadow-md rounded-xl border border-gray-200 hover:shadow-lg hover:scale-[1.02] transition duration-200"
        >
          <h2 className="text-lg font-semibold text-blue-700 mb-2">Enter Attendance</h2>
          <p className="text-gray-600">Mark daily attendance for Regular Batch students.</p>
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div className="p-6">Loading attendance...</div>}>
      <AttendanceContent />
    </Suspense>
  );
} 