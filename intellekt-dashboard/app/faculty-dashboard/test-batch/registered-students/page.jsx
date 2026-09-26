import { Suspense } from "react";
import TestBatchTestManagement from "../components/TestBatchTestManagement";

export default function registeredStudentsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <TestBatchTestManagement initialSection="registered-students" standalone />
    </Suspense>
  );
}
