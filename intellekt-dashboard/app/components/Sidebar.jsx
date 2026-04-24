export default function Sidebar() {
  return (
    <div className="sidebar w-64 min-h-screen p-6">

      <h1 className="text-2xl font-bold mb-8">
        Intellekt
      </h1>

      <ul className="space-y-4">
        <li>Dashboard</li>
        <li>Tests</li>
        <li>Marks</li>
        <li>Classes</li>
        <li>Logout</li>
      </ul>

    </div>
  );
}