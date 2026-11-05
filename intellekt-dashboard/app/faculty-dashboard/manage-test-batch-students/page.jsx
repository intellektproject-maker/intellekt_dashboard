"use client";

import { Suspense } from "react";
import TestBatchManager from "../test-batch/components/TestBatchManager";

function ManageTestBatchStudentsContent() {
  return <TestBatchManager section="dashboard" />;
}

export default function ManageTestBatchStudentsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading Test Batch Students...</div>}>
      <ManageTestBatchStudentsContent />
    </Suspense>
  );
}
