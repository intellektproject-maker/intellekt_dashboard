"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TestBatchManager from "../../faculty-dashboard/test-batch/components/TestBatchManager";
import TestBatchStudentTests from "./TestBatchStudentTests";

function TestBatchStudentPageInner() {
  const params = useSearchParams();
  const roll = (params.get("roll") || "").toUpperCase().trim();

  if (!/^IAT[0-9]{3,}$/.test(roll)) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow p-6">
          <h1 className="text-xl font-bold text-red-700">Invalid Test Batch ID</h1>
          <p className="text-gray-600 mt-2">
            Please sign in with a valid Test Batch student ID.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <TestBatchManager section="student-dashboard" rollNo={roll} />
        <TestBatchStudentTests rollNo={roll} />
      </div>
    </div>
  );
}

export default function TestBatchStudentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <TestBatchStudentPageInner />
    </Suspense>
  );
}
