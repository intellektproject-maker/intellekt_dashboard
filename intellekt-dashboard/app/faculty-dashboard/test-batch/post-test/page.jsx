import { Suspense } from "react";
import TestBatchTestManagement from "../components/TestBatchTestManagement";

export default function postTestPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <TestBatchTestManagement initialSection="schedule" standalone />
    </Suspense>
  );
}
