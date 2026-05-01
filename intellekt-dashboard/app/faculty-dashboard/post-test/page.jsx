"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://responsible-wonder-production.up.railway.app";

export default function PostTestPage() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [postedTests, setPostedTests] = useState([]);

  useEffect(() => {
    loadPostedTests();
  }, []);

  async function loadPostedTests() {
    try {
      const res = await fetch(`${API_BASE}/posted-tests`);
      const data = await res.json();
      setPostedTests(data);
    } catch (err) {
      console.error("Error loading tests:", err);
    }
  }

  // ✅ DELETE FUNCTION
  async function deleteTest(testCode) {
    const confirmDelete = window.confirm(
      `Delete test ${testCode}?`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(
        `${API_BASE}/posted-tests/${testCode}`,
        {
          method: "DELETE",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Delete failed");
        return;
      }

      alert("Deleted successfully");
      loadPostedTests(); // refresh table
    } catch (err) {
      console.error(err);
      alert("Error deleting test");
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold text-blue-800 mb-8">
        Post Test
      </h2>

      {/* ---------- YOUR FORM (UNCHANGED) ---------- */}
      {/* Keep your existing form here */}

      {/* ---------- POSTED TESTS TABLE ---------- */}
      <h2 className="text-2xl font-bold text-blue-800 mt-10 mb-5">
        Posted Tests
      </h2>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-blue-700 text-white">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Date</th>
              <th className="p-3">Marks</th>
              <th className="p-3">Class</th>
              <th className="p-3">Board</th>
              <th className="p-3">Duration</th>
              <th className="p-3">By</th>
              <th className="p-3">Portion</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>

          <tbody>
            {postedTests.map((t) => (
              <tr key={t.test_code} className="border-b">
                <td className="p-3 text-blue-700 font-semibold">
                  {t.test_code}
                </td>
                <td className="p-3">{t.subject_name}</td>
                <td className="p-3">
                  {new Date(t.test_date).toLocaleDateString()}
                </td>
                <td className="p-3">{t.total_marks}</td>
                <td className="p-3">{t.class}</td>
                <td className="p-3">{t.board}</td>
                <td className="p-3">
                  {t.duration_minutes} mins
                </td>
                <td className="p-3">{t.created_by}</td>
                <td className="p-3">{t.portion}</td>

                {/* ✅ DELETE BUTTON */}
                <td className="p-3">
                  <button
                    onClick={() => deleteTest(t.test_code)}
                    className="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}