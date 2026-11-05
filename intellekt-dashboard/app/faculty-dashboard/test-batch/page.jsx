"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TestBatchManager from "./components/TestBatchManager";
import TestBatchTestManagement from "./components/TestBatchTestManagement";

function TestBatchAdminPageInner() {
  const params = useSearchParams();
  const section = params.get("section") || "test";

  if (section === "attendance") return <TestBatchManager section="attendance" />;

  // Student management is available separately through Manage Test Batch Students.
  // Keep the four Test Batch test-management options on this page.
  return <TestBatchTestManagement />;
}

export default function TestBatchAdminPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading Test Batch...</div>}>
      <TestBatchAdminPageInner />
    </Suspense>
  );
}
