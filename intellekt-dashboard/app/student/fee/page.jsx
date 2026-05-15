"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

function FeePageContent() {
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll");

  const [fee, setFee] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roll) return;

    async function fetchFee() {
      try {
        setLoading(true);

        const res = await fetch(`${API_BASE}/fees/${roll}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          setFee([]);
          return;
        }

        const data = await res.json();

        setFee(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Fee fetch failed:", err);
        setFee([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFee();
  }, [roll]);

  const formatDate = (dateString) => {
    if (!dateString) return "-";

    const d = new Date(dateString);

    if (isNaN(d.getTime())) return "-";

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    return `${day}-${month}-${year}`;
  };

  if (!roll) {
    return (
      <div className="p-6 md:p-10 text-red-600 font-semibold">
        Roll number missing. Please login again.
      </div>
    );
  }

  if (loading) {
    return (
      <p className="p-6 md:p-10 text-gray-700">
        Loading...
      </p>
    );
  }

  return (
    <div className="p-6 md:p-10">
      <h2 className="text-2xl md:text-3xl font-bold text-blue-700 mb-6">
        Fee Details
      </h2>

      <div className="bg-white shadow-md rounded-xl p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-blue-700 text-white">
              <tr>
                <th className="p-3 text-left whitespace-nowrap">
                  Total Fee
                </th>

                <th className="p-3 text-left whitespace-nowrap">
                  Fee Paid
                </th>

                <th className="p-3 text-left whitespace-nowrap">
                  Balance
                </th>

                <th className="p-3 text-left whitespace-nowrap">
                  Next Due
                </th>
              </tr>
            </thead>

            <tbody>
              {fee.length > 0 ? (
                fee.map((f, i) => {
                  const totalFee = Number(f.total_fee || 0);
                  const feePaid = Number(f.fee_paid || 0);

                  const balance = Math.max(0, totalFee - feePaid);

                  return (
                    <tr key={i} className="border-b text-gray-700">
                      <td className="p-3 whitespace-nowrap">
                        {totalFee}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {feePaid}
                      </td>

                      <td className="p-3 whitespace-nowrap font-semibold text-red-600">
                        {balance}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {formatDate(f.next_due)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    className="p-6 text-center text-gray-500"
                  >
                    No fee records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function FeePage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 md:p-10 text-gray-700">
          Loading...
        </p>
      }
    >
      <FeePageContent />
    </Suspense>
  );
}