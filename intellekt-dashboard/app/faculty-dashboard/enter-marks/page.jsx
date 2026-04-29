"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "/backend-api";

export default function MarksPage() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [classBoard, setClassBoard] = useState("");
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [comments, setComments] = useState({});
  const [testCode, setTestCode] = useState("");

  const [autoTotal, setAutoTotal] = useState(null);
  const [manualTotal, setManualTotal] = useState("");

  const [errors, setErrors] = useState({});
  const [testCodeError, setTestCodeError] = useState("");
  const [classError, setClassError] = useState("");
  const [totalError, setTotalError] = useState("");

  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const totalMarks = manualTotal ? Number(manualTotal) : autoTotal;

  useEffect(() => {
    async function loadClasses() {
      try {
        const res = await fetch(`${API_BASE}/classes`);
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading classes:", err);
        setClasses([]);
      } finally {
        setLoadingClasses(false);
      }
    }

    loadClasses();
  }, []);

  function parseTestCode(code) {
    if (!code) return null;

    const upper = code.toUpperCase().trim();
    const match = upper.match(/^([CSI]B?)(\d{2})([MP])(\d+)C(\d+)$/);

    if (!match) return null;

    const boardPrefix = match[1];
    const classNum = match[2];
    const totalMarks = Number(match[4]);

    let boardName = null;

    if (boardPrefix === "C") boardName = "CBSE";
    else if (boardPrefix === "S" || boardPrefix === "SB") boardName = "State Board";
    else if (boardPrefix === "I") boardName = "ICSE";

    if (!boardName) return null;

    return { boardName, classNum, totalMarks };
  }

  function findMatchingClass(parsed) {
    if (!parsed) return null;

    return classes.find((c) => {
      const cls = String(c.class || "").toUpperCase();
      const brd = String(c.board || "").toUpperCase();

      return cls.includes(parsed.classNum) && brd === parsed.boardName.toUpperCase();
    });
  }

  function handleTestCode(value) {
    setTestCode(value);

    const parsed = parseTestCode(value);

    if (parsed) {
      setAutoTotal(parsed.totalMarks);
      setManualTotal("");
      setTestCodeError("");
      setTotalError("");

      const matched = findMatchingClass(parsed);

      if (matched) {
        setClassBoard(matched.class);
        setClassError("");
      } else {
        setClassBoard("");
      }
    } else {
      setAutoTotal(null);
      setClassBoard("");

      if (value.length > 3) {
        setTestCodeError("Invalid test code format");
      } else {
        setTestCodeError("");
      }
    }
  }

  function generateComment(mark) {
    if (!totalMarks && totalMarks !== 0) return "";

    const percentage = (Number(mark) / Number(totalMarks)) * 100;

    if (percentage >= 90) return "Excellent";
    if (percentage >= 75) return "Very Good";
    if (percentage >= 60) return "Good";
    if (percentage >= 40) return "Average";
    return "Needs Improvement";
  }

  async function loadStudents() {
    let hasError = false;

    if (!classBoard) {
      setClassError("Select class");
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

    if (!testCode.trim()) {
      setTestCodeError("Enter test code");
      hasError = true;
    }

    if (hasError) return;

    try {
      const res = await fetch(`${API_BASE}/students/${classBoard}`);
      const data = await res.json();

      setStudents(Array.isArray(data) ? data : []);
      setMarks({});
      setComments({});
      setErrors({});
    } catch (err) {
      console.error("Error loading students:", err);
      alert("Students loading failed");
    }
  }

  function handleMarks(roll, value) {
    if (value === "") {
      setMarks((prev) => ({ ...prev, [roll]: "" }));
      setComments((prev) => ({ ...prev, [roll]: "" }));
      setErrors((prev) => ({ ...prev, [roll]: "Required" }));
      return;
    }

    let clean = value.replace(/\D/g, "").replace(/^0+/, "");

    if (clean === "") clean = "0";

    const num = Number(clean);

    if (num > totalMarks) {
      setErrors((prev) => ({ ...prev, [roll]: `Max ${totalMarks}` }));
      return;
    }

    setMarks((prev) => ({ ...prev, [roll]: num }));
    setErrors((prev) => ({ ...prev, [roll]: "" }));
    setComments((prev) => ({ ...prev, [roll]: generateComment(num) }));
  }

  async function submitMarks() {
    const newErrors = {};
    let hasError = false;

    students.forEach((student) => {
      const mark = marks[student.roll_no];

      if (mark === "" || mark === undefined) {
        newErrors[student.roll_no] = "Required";
        hasError = true;
      }
    });

    setErrors(newErrors);

    if (hasError) {
      alert("Please enter marks for all students");
      return;
    }

    const payload = students.map((student) => ({
      roll_no: student.roll_no,
      marks: marks[student.roll_no],
      comments: comments[student.roll_no] || "",
      test_code: testCode.toUpperCase().trim(),
      total_marks: totalMarks,
    }));

    try {
      const res = await fetch(`${API_BASE}/marks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          records: payload,
          facultyId,
        }),
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
              <input
                type="text"
                placeholder="Example: C11M50C10"
                className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                  testCodeError ? "border-red-500" : "border-gray-300"
                }`}
                value={testCode}
                onChange={(e) => handleTestCode(e.target.value)}
              />
              {testCodeError && (
                <p className="text-red-500 text-xs mt-1">{testCodeError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Class
              </label>
              <select
                className={`w-full appearance-none bg-white border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                  classError ? "border-red-500" : "border-gray-300"
                }`}
                value={classBoard}
                onChange={(e) => {
                  setClassBoard(e.target.value);
                  setClassError("");
                }}
                disabled={loadingClasses}
              >
                <option value="">
                  {loadingClasses ? "Loading classes..." : "Select Class"}
                </option>

                {classes.map((item, index) => (
                  <option key={index} value={item.class}>
                    {item.class} — {item.board}
                  </option>
                ))}
              </select>
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
                placeholder="Total Marks"
                className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                  totalError ? "border-red-500" : "border-gray-300"
                }`}
                value={manualTotal || totalMarks || ""}
                onChange={(e) => {
                  setManualTotal(e.target.value);
                  setTotalError("");
                }}
              />
              {totalError && (
                <p className="text-red-500 text-xs mt-1">{totalError}</p>
              )}
            </div>

            <div className="flex items-end">
              <button
                onClick={loadStudents}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-lg transition"
              >
                Load Students
              </button>
            </div>
          </div>
        </div>

        {students.length > 0 && (
          <div className="bg-white shadow-md rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-12 bg-gray-100 border-b border-gray-300 font-bold text-gray-800">
              <div className="col-span-2 p-4 border-r">Roll No</div>
              <div className="col-span-4 p-4 border-r">Student Name</div>
              <div className="col-span-2 p-4 border-r text-center">Marks</div>
              <div className="col-span-2 p-4 border-r text-center">Total</div>
              <div className="col-span-2 p-4 text-center">Comment</div>
            </div>

            {students.map((student) => (
              <div
                key={student.roll_no}
                className="grid grid-cols-12 items-center border-b last:border-b-0 hover:bg-gray-50"
              >
                <div className="col-span-2 p-4 border-r font-semibold text-gray-700">
                  {student.roll_no}
                </div>

                <div className="col-span-4 p-4 border-r text-gray-800">
                  {student.name}
                </div>

                <div className="col-span-2 p-4 border-r">
                  <input
                    type="text"
                    value={marks[student.roll_no] ?? ""}
                    onChange={(e) =>
                      handleMarks(student.roll_no, e.target.value)
                    }
                    className={`w-full border rounded-lg px-3 py-2 text-center outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors[student.roll_no]
                        ? "border-red-500"
                        : "border-gray-300"
                    }`}
                    placeholder="Mark"
                  />
                  {errors[student.roll_no] && (
                    <p className="text-red-500 text-xs text-center mt-1">
                      {errors[student.roll_no]}
                    </p>
                  )}
                </div>

                <div className="col-span-2 p-4 border-r text-center font-bold text-gray-800">
                  {totalMarks}
                </div>

                <div className="col-span-2 p-4">
                  <input
                    type="text"
                    value={comments[student.roll_no] || ""}
                    onChange={(e) =>
                      setComments((prev) => ({
                        ...prev,
                        [student.roll_no]: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Comment"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {students.length > 0 && (
          <button
            onClick={submitMarks}
            className="mt-8 bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3 rounded-lg transition"
          >
            Save Marks
          </button>
        )}
      </div>
    </div>
  );
}