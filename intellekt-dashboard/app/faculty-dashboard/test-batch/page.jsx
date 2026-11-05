"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TestBatchManager from "./components/TestBatchManager";
import TestBatchTestManagement from "./components/TestBatchTestManagement";

function TestBatchAdminPageInner() {
  const params = useSearchParams();
  const section = params.get("section") || "dashboard";

  if (section === "attendance") return <TestBatchManager section="attendance" />;

  return (
    <>
      <TestBatchManager section={section} />
      <TestBatchTestManagement />
    </>
  );
}

export default function TestBatchAdminPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading Test Batch...</div>}>
      <TestBatchAdminPageInner />
    </Suspense>
  );
}
