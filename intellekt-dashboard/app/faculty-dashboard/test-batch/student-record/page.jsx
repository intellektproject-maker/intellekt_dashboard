"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://responsible-wonder-production.up.railway.app";

const ADMIN_IDS = ["IG001", "IG002"];

export default function TestBatchStudentRecordPage() {
  const params = useSearchParams();
  const adminId = (params.get("id") || "").toUpperCase().trim();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [error, setError] = useState("");
  const [hasViewed, setHasViewed] = useState(false);

  useEffect(() => {
    if (!ADMIN_IDS.includes(adminId)) return;
    let cancelled = false;

    async function loadClasses() {
      setLoadingClasses(true);
      try {
        const query = new URLSearchParams({ adminId });
        const response = await fetch(API_BASE + "/test-batch/students?" + query.toString(), { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to load Test Batch classes");
        if (!cancelled) {
          setClasses(Array.isArray(data.available_classes) ? data.available_classes : []);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load Test Batch classes");
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    }

    loadClasses();
    return () => { cancelled = true; };
  }, [adminId]);

  async function viewStudents() {
    if (!selectedClass) {
      setStudents([]);
      setHasViewed(false);
      setError("Please select a class.");
      return;
    }

    setLoadingStudents(true);
    setError("");
    setHasViewed(true);
    try {
      const query = new URLSearchParams({ adminId, class: selectedClass });
      const response = await fetch(API_BASE + "/test-batch/students?" + query.toString(), { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load Test Batch students");
      setStudents(Array.isArray(data.students) ? data.students : []);
    } catch (e) {
      setStudents([]);
      setError(e.message || "Failed to load Test Batch students");
    } finally {
      setLoadingStudents(false);
    }
  }

  if (!ADMIN_IDS.includes(adminId)) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 md:p-10">
        <div className="rounded-xl border border-red-200 bg-white p-6 text-red-700">
          Unauthorized. Test Batch student records are available only to authorized administrators.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <h1 className="mb-8 text-2xl font-bold text-blue-800 md:text-3xl">Test Batch Student Record</h1>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-md">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <select
            aria-label="Select Test Batch class"
            value={selectedClass}
            onChange={(event) => {
              setSelectedClass(event.target.value);
              setStudents([]);
              setHasViewed(false);
              setError("");
            }}
            className="rounded-lg border border-gray-300 px-4 py-3"
            disabled={loadingClasses}
          >
            <option value="">{loadingClasses ? "Loading classes..." : "Select Class"}</option>
            {classes.map((className) => (
              <option key={className} value={className}>{className}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={viewStudents}
            disabled={loadingStudents || loadingClasses}
            className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingStudents ? "Loading..." : "View Students"}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mb-5 text-center text-sm text-red-600">{error}</p>}

      {loadingStudents ? (
        <div className="text-center text-gray-600">Loading students...</div>
      ) : students.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-md">
          <table className="min-w-full">
            <thead className="bg-blue-50">
              <tr>
                <th className="px-4 py-3 text-left">Roll No</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Board</th>
                <th className="px-4 py-3 text-left">Test Series</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.roll_no} className="border-t">
                  <td className="px-4 py-3">{student.roll_no}</td>
                  <td className="px-4 py-3">{student.name || "-"}</td>
                  <td className="px-4 py-3">{student.class || "-"}</td>
                  <td className="px-4 py-3">{student.board || "-"}</td>
                  <td className="px-4 py-3">{student.test_series_name || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : hasViewed ? (
        <div className="text-center text-gray-500">No Test Batch students found for this class.</div>
      ) : (
        <div className="text-center text-gray-500">Select a class and choose View Students.</div>
      )}
    </div>
  );
}
