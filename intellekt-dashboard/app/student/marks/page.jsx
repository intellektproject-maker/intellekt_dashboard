"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

function MarksPageContent() {
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll");

  const [marks, setMarks] = useState(null);

  useEffect(() => {
    if (!roll) return;

    async function fetchMarks() {
      try {
        const res = await fetch(`${API_BASE}/marks/${roll}`, {
          cache: "no-store",
        });

        const data = await res.json();
        setMarks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setMarks([]);
      }
    }

    fetchMarks();
  }, [roll]);

  if (!marks) {
    return <p className="p-4">Loading...</p>;
  }

  const mathsMarks = marks.filter(
    (m) =>
      Number(m.subject_id) === 1 ||
      String(m.subject_name || "").toUpperCase() === "MATHS"
  );

  const physicsMarks = marks.filter(
    (m) =>
      Number(m.subject_id) === 2 ||
      String(m.subject_name || "").toUpperCase() === "PHYSICS"
  );

  const renderMark = (mark) => {
    if (String(mark).toUpperCase() === "A") return "Absent";
    return mark ?? "-";
  };

  const renderTable = (title, data) => (
    <div className="mb-8">
      <h3 className="text-xl md:text-2xl font-bold text-blue-800 mb-4">
        {title}
      </h3>

      <div className="bg-white shadow rounded-xl p-4 md:p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm md:text-base">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-2 border whitespace-nowrap">Test Code</th>
                <th className="p-2 border whitespace-nowrap">Marks Obtained</th>
                <th className="p-2 border whitespace-nowrap">Total Marks</th>
                <th className="p-2 border whitespace-nowrap">Comments</th>
              </tr>
            </thead>

            <tbody>
              {data.length > 0 ? (
                data.map((m, index) => (
                  <tr key={`${m.test_code}-${index}`}>
                    <td className="p-2 border whitespace-nowrap">
                      {m.test_code || "-"}
                    </td>
                    <td className="p-2 border whitespace-nowrap">
                      {renderMark(m.marks_obtained)}
                    </td>
                    <td className="p-2 border whitespace-nowrap">
                      {m.total_marks ?? "-"}
                    </td>
                    <td className="p-2 border break-words">
                      {m.comments || "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    className="p-4 border text-center text-gray-500"
                  >
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-10">
      <h2 className="text-2xl md:text-3xl font-bold text-blue-800 mb-6">
        Marks
      </h2>

      {renderTable("Mathematics", mathsMarks)}
      {renderTable("Physics", physicsMarks)}
    </div>
  );
}

export default function MarksPage() {
  return (
    <Suspense fallback={<p className="p-4">Loading...</p>}>
      <MarksPageContent />
    </Suspense>
  );
}