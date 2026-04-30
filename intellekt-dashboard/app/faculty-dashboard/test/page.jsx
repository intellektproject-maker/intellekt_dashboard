"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function TestPageInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id") || "";

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Test Management
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 max-w-6xl">
        <Link
          href={`/faculty-dashboard/enter-marks?id=${facultyId}`}
          className="bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition duration-200"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Enter Marks
          </h3>
          <p className="text-gray-600">
            Add marks for students after a test.
          </p>
        </Link>

        <Link
          href={`/faculty-dashboard/manage-marks?id=${facultyId}`}
          className="bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition duration-200"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Manage Marks
          </h3>
          <p className="text-gray-600">
            View and edit student marks.
          </p>
        </Link>

        <Link
          href={`/faculty-dashboard/post-test?id=${facultyId}`}
          className="bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition duration-200"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Post Test
          </h3>
          <p className="text-gray-600">
            Schedule upcoming tests.
          </p>
        </Link>

        <Link
          href={`/faculty-dashboard/registered-students?id=${facultyId}`}
          className="bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition duration-200"
        >
          <h3 className="text-lg font-semibold text-blue-700 mb-2">
            Registered Students
          </h3>
          <p className="text-gray-600">
            View registered students and download PDF.
          </p>
        </Link>
      </div>
    </div>
  );
}

export default function TestPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <TestPageInner />
    </Suspense>
  );
}