import { Suspense } from "react";
import TestBatchTestManagement from "../components/TestBatchTestManagement";

export default function testListPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <TestBatchTestManagement initialSection="list" standalone />
    </Suspense>
  );
}
