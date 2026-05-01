"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://responsible-wonder-production.up.railway.app";

function PostTestInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id") || "";

  const [testCode, setTestCode] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [marks, setMarks] = useState("");
  const [portion, setPortion] = useState("");
  const [className, setClassName] = useState("");
  const [board, setBoard] = useState("");
  const [duration, setDuration] = useState("");
  const [registrationEndDate, setRegistrationEndDate] = useState("");
  const [writingAllowedTill, setWritingAllowedTill] = useState("");
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [postedTests, setPostedTests] = useState([]);

  useEffect(() => {
    async function loadClasses() {
      try {
        const res = await fetch(`${API_BASE}/classes`);
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading classes:", err);
      } finally {
        setLoadingClasses(false);
      }
    }

    loadClasses();
  }, []);

  async function loadPostedTests() {
    try {
      const res = await fetch(`${API_BASE}/posted-tests`, {
        cache: "no-store",
      });
      const data = await res.json();
      setPostedTests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading posted tests:", err);
    }
  }

  useEffect(() => {
    loadPostedTests();
  }, []);

  function handleClassChange(e) {
    const val = e.target.value;
    if (!val) return;

    const [cls, brd] = val.split("||");
    setClassName(cls);
    setBoard(brd);
  }

  function handleTestCodeChange(e) {
    setTestCode(e.target.value.toUpperCase());
  }

  function formatDate(dateValue) {
    if (!dateValue) return "-";
    return new Date(dateValue).toLocaleDateString("en-IN");
  }

  async function postTest() {
    try {
      const res = await fetch(`${API_BASE}/post-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_code: testCode,
          subject_id: Number(subject),
          test_date: date,
          total_marks: Number(marks),
          portion,
          created_by: facultyId,
          class_name: className,
          board,
          duration_minutes: Number(duration),
          registration_end_date: registrationEndDate,
          writing_allowed_till: writingAllowedTill,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed");
        return;
      }

      alert("Test posted!");
      loadPostedTests();
    } catch (err) {
      console.error(err);
    }
  }

  // ✅ DELETE FUNCTION
  async function deleteTest(testCode) {
    if (!window.confirm(`Delete test ${testCode}?`)) return;

    try {
      const res = await fetch(`${API_BASE}/posted-tests/${testCode}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Delete failed");
        return;
      }

      alert("Deleted successfully");
      loadPostedTests();
    } catch (err) {
      console.error(err);
      alert("Error deleting test");
    }
  }

  return (
    <div className="p-6 md:p-10 bg-gray-50">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Post Test
      </h1>

      {/* FORM */}
      <div className="bg-white shadow-md rounded-xl border p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <input
            placeholder="Test Code"
            value={testCode}
            onChange={handleTestCodeChange}
            className="border px-4 py-3 rounded-lg"
          />

          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="border px-4 py-3 rounded-lg"
          >
            <option value="">Subject</option>
            <option value="1">Maths</option>
            <option value="2">Physics</option>
          </select>

          <input type="date" onChange={(e) => setDate(e.target.value)} />
          <input
            type="number"
            placeholder="Marks"
            onChange={(e) => setMarks(e.target.value)}
          />

          <input
            placeholder="Portion"
            onChange={(e) => setPortion(e.target.value)}
          />

          <select onChange={handleClassChange}>
            <option>Select Class</option>
            {classes.map((c, i) => (
              <option key={i} value={`${c.class}||${c.board}`}>
                {c.class} - {c.board}
              </option>
            ))}
          </select>

          <input value={board} readOnly />
          <input
            placeholder="Duration"
            onChange={(e) => setDuration(e.target.value)}
          />

          <input type="date" onChange={(e) => setRegistrationEndDate(e.target.value)} />
          <input type="date" onChange={(e) => setWritingAllowedTill(e.target.value)} />
        </div>

        <button
          onClick={postTest}
          className="mt-6 w-full bg-blue-700 text-white py-3 rounded-lg"
        >
          Create Test
        </button>
      </div>

      {/* TABLE */}
      <div className="mt-10">
        <h2 className="text-xl font-bold text-blue-800 mb-4">
          Posted Tests
        </h2>

        <div className="bg-white shadow-md rounded-xl border overflow-x-auto">
          <table className="w-full">
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
                  <td className="p-3 text-blue-700">{t.test_code}</td>
                  <td className="p-3">{t.subject_name}</td>
                  <td className="p-3">{formatDate(t.test_date)}</td>
                  <td className="p-3">{t.total_marks}</td>
                  <td className="p-3">{t.class}</td>
                  <td className="p-3">{t.board}</td>
                  <td className="p-3">{t.duration_minutes} mins</td>
                  <td className="p-3">{t.created_by}</td>
                  <td className="p-3">{t.portion}</td>

                  <td className="p-3">
                    <button
                      onClick={() => deleteTest(t.test_code)}
                      className="bg-red-600 text-white px-3 py-1 rounded"
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
    </div>
  );
}

export default function PostTest() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PostTestInner />
    </Suspense>
  );
}