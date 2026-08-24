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

  const handlePay = () => {
    alert("Online payment option will be available soon.");
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

      {fee.length > 0 ? (
        fee.map((f, i) => {
          const totalFee = Number(f.total_fee || 0);
          const feePaid = Number(f.fee_paid || 0);
          const balance = Math.max(0, totalFee - feePaid);

          /*
           * Payment history will come from the backend.
           * If it doesn't exist yet, use an empty array.
           */
          const paymentHistory = Array.isArray(f.payment_history)
            ? f.payment_history
            : [];

          return (
            <div
              key={i}
              className="bg-white shadow-md rounded-xl p-6 mb-8"
            >
              {/* CURRENT FEE STATUS */}

              <h3 className="text-xl font-semibold text-gray-800 mb-4">
                Current Fee Status
              </h3>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-blue-700 text-white">
                    <tr>
                      <th className="p-3 text-left whitespace-nowrap">
                        Total Fee
                      </th>

                      <th className="p-3 text-left whitespace-nowrap">
                        Total Paid
                      </th>

                      <th className="p-3 text-left whitespace-nowrap">
                        Balance
                      </th>

                      <th className="p-3 text-left whitespace-nowrap">
                        Next Due
                      </th>

                      <th className="p-3 text-left whitespace-nowrap">
                        Payment
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr className="border-b text-gray-700">
                      <td className="p-3 whitespace-nowrap">
                        ₹{totalFee}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        ₹{feePaid}
                      </td>

                      <td
                        className={`p-3 whitespace-nowrap font-semibold ${
                          balance > 0
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                      >
                        ₹{balance}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {balance > 0
                          ? formatDate(f.next_due)
                          : "Fully Paid"}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {balance > 0 ? (
                          <button
                            onClick={handlePay}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                          >
                            Pay
                          </button>
                        ) : (
                          <span className="text-green-600 font-semibold">
                            Paid
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* PAYMENT HISTORY */}

              {paymentHistory.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4">
                    Payment History
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead className="bg-gray-700 text-white">
                        <tr>
                          <th className="p-3 text-left whitespace-nowrap">
                            Payment Date
                          </th>

                          <th className="p-3 text-left whitespace-nowrap">
                            Amount Paid
                          </th>

                          <th className="p-3 text-left whitespace-nowrap">
                            Total Paid
                          </th>

                          <th className="p-3 text-left whitespace-nowrap">
                            Balance
                          </th>

                          <th className="p-3 text-left whitespace-nowrap">
                            Next Due
                          </th>

                          <th className="p-3 text-left whitespace-nowrap">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {paymentHistory.map((payment, index) => {
                          const amountPaid = Number(
                            payment.amount_paid || 0
                          );

                          const totalPaid = Number(
                            payment.total_paid || 0
                          );

                          const paymentBalance = Math.max(
                            0,
                            Number(
                              payment.balance ??
                                totalFee - totalPaid
                            )
                          );

                          return (
                            <tr
                              key={index}
                              className="border-b text-gray-700"
                            >
                              <td className="p-3 whitespace-nowrap">
                                {formatDate(
                                  payment.payment_date
                                )}
                              </td>

                              <td className="p-3 whitespace-nowrap">
                                ₹{amountPaid}
                              </td>

                              <td className="p-3 whitespace-nowrap">
                                ₹{totalPaid}
                              </td>

                              <td
                                className={`p-3 whitespace-nowrap font-semibold ${
                                  paymentBalance > 0
                                    ? "text-red-600"
                                    : "text-green-600"
                                }`}
                              >
                                ₹{paymentBalance}
                              </td>

                              <td className="p-3 whitespace-nowrap">
                                {paymentBalance > 0
                                  ? formatDate(
                                      payment.next_due
                                    )
                                  : "-"}
                              </td>

                              <td className="p-3 whitespace-nowrap">
                                {paymentBalance === 0 ? (
                                  <span className="text-green-600 font-semibold">
                                    Fully Paid
                                  </span>
                                ) : (
                                  <span className="text-orange-600 font-semibold">
                                    Partially Paid
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* NO HISTORY YET */}

              {paymentHistory.length === 0 && feePaid > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg text-gray-600">
                  Payment history will appear here after payment
                  records are added.
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="bg-white shadow-md rounded-xl p-6">
          <p className="text-center text-gray-500">
            No fee records found
          </p>
        </div>
      )}
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