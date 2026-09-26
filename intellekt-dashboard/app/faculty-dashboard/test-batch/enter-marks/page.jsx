import { Suspense } from "react";
import TestBatchTestManagement from "../components/TestBatchTestManagement";

export default function TestBatchEnterMarksPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <TestBatchTestManagement initialSection="mark-entry" standalone />
    </Suspense>
  );
}
