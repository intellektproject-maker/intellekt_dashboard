export async function getStudentProfile(rollNo) {
	try {
		const response = await fetch(`https://responsible-wonder-production.up.railway.app/student/${rollNo}`);

		if (!response.ok) {
			throw new Error('Failed to fetch student');
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Student API error:', error);
		return null;
	}
}
