"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://responsible-wonder-production.up.railway.app";

function MarksPageContent() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [tests, setTests] = useState([]);
  const [testCode, setTestCode] = useState("");
  const [selectedTest, setSelectedTest] = useState(null);

  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [comments, setComments] = useState({});
  const [errors, setErrors] = useState({});

  const [manualTotal, setManualTotal] = useState("");
  const [loadingTests, setLoadingTests] = useState(true);

  const [testCodeError, setTestCodeError] = useState("");
  const [classError, setClassError] = useState("");
  const [totalError, setTotalError] = useState("");

  const totalMarks = manualTotal
    ? Number(manualTotal)
    : selectedTest
    ? Number(selectedTest.total_marks)
    : "";

  useEffect(() => {
    async function loadTests() {
      try {
        const res = await fetch(`${API_BASE}/tests`);
        const data = await res.json();
        setTests(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading tests:", err);
        setTests([]);
      } finally {
        setLoadingTests(false);
      }
    }

    loadTests();
  }, []);

  function handleTestCode(value) {
    setTestCode(value);
    setStudents([]);
    setMarks({});
    setComments({});
    setErrors({});
    setManualTotal("");

    const foundTest = tests.find(
      (t) => String(t.test_code).trim() === String(value).trim()
    );

    if (!foundTest) {
      setSelectedTest(null);
      setTestCodeError(value ? "Invalid test selected" : "");
      return;
    }

    setSelectedTest(foundTest);
    setTestCodeError("");
    setClassError("");
    setTotalError("");
  }

function generateComment(mark) {
  if (String(mark).toUpperCase() === "A") return "Absent";

  if (!totalMarks) return "";

  const percentage = (Number(mark) / Number(totalMarks)) * 100;

  if (percentage >= 90) return "Excellent";
  if (percentage >= 75) return "Very Good";
  if (percentage >= 60) return "Good";
  if (percentage >= 40) return "Average";
  return "Needs Improvement";
}

  async function loadStudents() {
    let hasError = false;

    if (!testCode || !selectedTest) {
      setTestCodeError("Select test code");
      hasError = true;
    } else {
      setTestCodeError("");
    }

    if (!selectedTest?.class || !selectedTest?.board) {
      setClassError("Class/board missing for selected test");
      hasError = true;
    } else {
      setClassError("");
    }

    if (!totalMarks) {
      setTotalError("Enter total marks");
      hasError = true;
    } else {
      setTotalError("");
    }

    if (hasError) return;

    try {
      const res = await fetch(
        `${API_BASE}/enter-marks-students?className=${encodeURIComponent(
          selectedTest.class
        )}&board=${encodeURIComponent(
          selectedTest.board
        )}&testCode=${encodeURIComponent(testCode)}`
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Students loading failed");
        return;
      }

      setStudents(Array.isArray(data) ? data : []);
      setMarks({});
      setComments({});
      setErrors({});

      if (!Array.isArray(data) || data.length === 0) {
        alert("No students found for this test subject/class");
      }
    } catch (err) {
      console.error("Error loading students:", err);
      alert("Students loading failed");
    }
  }

  function handleMarks(roll, value) {
  const raw = value.trim();

  if (raw === "") {
    setMarks((p) => ({ ...p, [roll]: "" }));
    setComments((p) => ({ ...p, [roll]: "" }));
    setErrors((p) => ({ ...p, [roll]: "Required" }));
    return;
  }

  if (raw.toUpperCase() === "A") {
    setMarks((p) => ({ ...p, [roll]: "A" }));
    setErrors((p) => ({ ...p, [roll]: "" }));
    setComments((p) => ({ ...p, [roll]: "Absent" }));
    return;
  }

  if (!/^\d+$/.test(raw)) {
    setErrors((p) => ({ ...p, [roll]: "Only numbers or A" }));
    return;
  }

  const num = Number(raw);

  if (num > totalMarks) {
    setErrors((p) => ({ ...p, [roll]: `Max ${totalMarks}` }));
    return;
  }

  setMarks((p) => ({ ...p, [roll]: num }));
  setErrors((p) => ({ ...p, [roll]: "" }));
  setComments((p) => ({ ...p, [roll]: generateComment(num) }));
}
  async function submitMarks() {
    if (students.length === 0) {
      alert("Load students first");
      return;
    }

    const newErrors = {};
    let hasError = false;

    students.forEach((s) => {
      if (marks[s.roll_no] === "" || marks[s.roll_no] === undefined) {
        newErrors[s.roll_no] = "Required";
        hasError = true;
      }
    });

    setErrors(newErrors);

    if (hasError) {
      alert("Please enter marks for all students");
      return;
    }

    const payload = students.map((s) => ({
      roll_no: s.roll_no,
      student_name: s.name,
      marks: marks[s.roll_no],
      comments: comments[s.roll_no] || "",
      test_code: testCode.toUpperCase().trim(),
      total_marks: totalMarks,
    }));

    try {
      const res = await fetch(`${API_BASE}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: payload, facultyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Error saving marks");
        return;
      }

      alert("Marks saved successfully!");
    } catch (err) {
      console.error("Save marks error:", err);
      alert("Error saving marks");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-blue-700 mb-8">
          Enter Marks
        </h2>

        <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Test Code
              </label>

              <select
                className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                  testCodeError ? "border-red-500" : "border-gray-300"
                }`}
                value={testCode}
                onChange={(e) => handleTestCode(e.target.value)}
                disabled={loadingTests}
              >
                <option value="">
                  {loadingTests ? "Loading tests..." : "Select Test Code"}
                </option>

                {tests.map((t) => (
                  <option key={t.test_code} value={t.test_code}>
                    {t.test_code} — {t.class} — {t.board}
                  </option>
                ))}
              </select>

              {testCodeError && (
                <p className="text-red-500 text-xs mt-1">{testCodeError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Class
              </label>

              <input
                type="text"
                readOnly
                value={
                  selectedTest
                    ? `${selectedTest.class} — ${selectedTest.board}`
                    : ""
                }
                placeholder="Auto-filled"
                className={`w-full border rounded-lg px-4 py-3 bg-gray-100 ${
                  classError ? "border-red-500" : "border-gray-300"
                }`}
              />

              {classError && (
                <p className="text-red-500 text-xs mt-1">{classError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Total Marks
              </label>

              <input
                type="number"
                className={`w-full border rounded-lg px-4 py-3 ${
                  totalError ? "border-red-500" : "border-gray-300"
                }`}
                value={manualTotal || totalMarks || ""}
                onChange={(e) => setManualTotal(e.target.value)}
              />

              {totalError && (
                <p className="text-red-500 text-xs mt-1">{totalError}</p>
              )}
            </div>

            <div className="flex items-end">
              <button
                onClick={loadStudents}
                className="w-full bg-blue-600 text-white px-5 py-3 rounded-lg hover:bg-blue-700"
              >
                Load Students
              </button>
            </div>
          </div>
        </div>

        {students.length > 0 && (
          <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse">
                <thead className="bg-blue-700 text-white">
                  <tr>
                    <th className="p-3 text-left">Roll No</th>
                    <th className="p-3 text-left">Student Name</th>
                    <th className="p-3 text-left">Marks</th>
                    <th className="p-3 text-left">Comment</th>
                    <th className="p-3 text-left">Error</th>
                  </tr>
                </thead>

                <tbody>
                  {students.map((s) => (
                    <tr key={s.roll_no} className="border-b text-gray-700">
                      <td className="p-3">{s.roll_no}</td>
                      <td className="p-3">{s.name}</td>

                      <td className="p-3">
                        <input
                          type="text"
                          value={marks[s.roll_no] ?? ""}
                          onChange={(e) =>
                            handleMarks(s.roll_no, e.target.value)
                          }
                          className="border rounded-lg px-3 py-2 w-24"
                        />
                      </td>

                      <td className="p-3">{comments[s.roll_no] || "-"}</td>

                      <td className="p-3 text-red-500 text-sm">
                        {errors[s.roll_no] || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={submitMarks}
              className="mt-8 bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700"
            >
              Save Marks
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarksPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <MarksPageContent />
    </Suspense>
  );
}