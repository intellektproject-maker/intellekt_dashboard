"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TestBatchManager from "./components/TestBatchManager";

function TestBatchAdminPageInner() {
  const params = useSearchParams();
  const section = params.get("section") || "dashboard";

  return <TestBatchManager section={section} />;
}

export default function TestBatchAdminPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading Test Batch...</div>}>
      <TestBatchAdminPageInner />
    </Suspense>
  );
}
