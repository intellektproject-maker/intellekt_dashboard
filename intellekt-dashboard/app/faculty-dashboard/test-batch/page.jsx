"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TestBatchManager from "./components/TestBatchManager";
import TestBatchTestManagement from "./components/TestBatchTestManagement";

function TestBatchAdminPageInner() {
  const params = useSearchParams();
  const section = params.get("section") || "dashboard";
  const feature = params.get("feature") || "";
  const facultyId = (params.get("id") || "").toUpperCase().trim();
  const isAdmin = facultyId === "IG001" || facultyId === "IG002";
  const isFaculty = /^IG\d{3,}$/.test(facultyId);

  if (feature && isFaculty) {
    return <TestBatchTestManagement key={feature} initialSection={feature} />;
  }

  // Keep the existing administrator dashboard unchanged. For other valid
  // faculty accounts, show the shared Test Batch feature hub.
  if (!isAdmin && isFaculty) {
    return <TestBatchTestManagement initialSection="" />;
  }

  return <TestBatchManager section={section} />;
}

export default function TestBatchAdminPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading Test Batch...</div>}>
      <TestBatchAdminPageInner />
    </Suspense>
  );
}
