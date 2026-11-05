"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function TestPageInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id") || "";

  return (
    <div className="p-4 md:p-8">
      <h2 className="mb-8 text-2xl font-bold text-blue-800 md:text-3xl">
        Test Management
      </h2>

      <div className="grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Link
          href={`/faculty-dashboard/enter-marks?id=${facultyId}`}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-md transition duration-200 hover:scale-[1.02] hover:shadow-lg"
        >
          <h3 className="mb-2 text-lg font-semibold text-blue-700">Enter Marks</h3>
          <p className="text-gray-600">
            Enter new marks and request approval to edit previously saved marks.
          </p>
        </Link>

        <Link
          href={`/faculty-dashboard/post-test?id=${facultyId}`}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-md transition duration-200 hover:scale-[1.02] hover:shadow-lg"
        >
          <h3 className="mb-2 text-lg font-semibold text-blue-700">Post Test</h3>
          <p className="text-gray-600">Schedule upcoming tests.</p>
        </Link>

        <Link
          href={`/faculty-dashboard/registered-students?id=${facultyId}`}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-md transition duration-200 hover:scale-[1.02] hover:shadow-lg"
        >
          <h3 className="mb-2 text-lg font-semibold text-blue-700">Registered Students</h3>
          <p className="text-gray-600">View registered students and download PDF.</p>
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
