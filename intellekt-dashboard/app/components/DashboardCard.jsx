export function DashboardCard({ title, value, Icon }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow flex justify-between items-center">
      <div>
        <p className="text-gray-500">{title}</p>
        <h2 className="text-3xl font-bold text-blue-700">{value}</h2>
      </div>

      {Icon ? (
        <div className="bg-blue-100 p-3 rounded-lg">
          <Icon size={28} className="text-blue-600" />
        </div>
      ) : null}
    </div>
  );
}

export default DashboardCard;