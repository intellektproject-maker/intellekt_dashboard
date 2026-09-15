'use strict';

const admin = require('firebase-admin');

const { cert, getApps, initializeApp, getApp, getMessaging } = require('firebase-admin/app');

function initializeFirebase() {
  try {
    if (getApps().length > 0) {
      return getApp();
    }

    const serviceAccountJson =
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      console.warn(
        '[Faculty Push] FIREBASE_SERVICE_ACCOUNT_JSON is not configured'
      );
      return null;
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    return initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (error) {
    console.error(
      '[Faculty Push] Firebase Admin initialization failed:',
      error.message
    );
    return null;
  }
}

initializeFirebase();

const INVALID_TOKEN_CODES = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token',
	'messaging/invalid-argument'
]);

const ANDROID_NOTIFICATION_CHANNEL_ID = 'intellekt_high_importance';

function getMessaging() {
	if (!admin.apps || admin.apps.length === 0) {
		console.warn(
			'[Faculty Push] Firebase Admin is not initialized'
		);

		return null;
	}

	return admin.messaging();
}

function normalizeFacultyIds(facultyIds) {
	return [
		...new Set(
			(facultyIds || [])
				.map((id) => String(id || '').trim().toUpperCase())
				.filter(Boolean)
		)
	];
}

function normalizeData(data = {}) {
	return Object.fromEntries(
		Object.entries(data).map(([key, value]) => [
			String(key),
			String(value ?? '')
		])
	);
}

async function sendToFaculty(
	pool,
	facultyIds,
	{
		title,
		body,
		data = {}
	}
) {
	const ids = normalizeFacultyIds(facultyIds);

	if (!ids.length) {
		console.warn(
			'[Faculty Push] No faculty IDs supplied'
		);

		return {
			sent: 0,
			failed: 0,
			removed: 0,
			tokenCount: 0
		};
	}

	const messaging = getMessaging();

	if (!messaging) {
		console.warn(
			'[Faculty Push] Push skipped because Firebase Messaging is unavailable'
		);

		return {
			sent: 0,
			failed: 0,
			removed: 0,
			tokenCount: 0
		};
	}

	console.log(
		`[Faculty Push] Preparing push for faculty: ${ids.join(', ')}`
	);

	let tokenResult;

	try {
		tokenResult = await pool.query(
			`SELECT token, faculty_id
			 FROM faculty_device_tokens
			 WHERE UPPER(TRIM(faculty_id)) = ANY($1::text[])`,
			[ids]
		);
	} catch (error) {
		console.error(
			'[Faculty Push] Failed to retrieve device tokens:',
			error
		);

		throw error;
	}

	const tokenRows = tokenResult.rows || [];

	const tokens = [
		...new Set(
			tokenRows
				.map((row) => row.token)
				.filter(
					(token) =>
						typeof token === 'string' &&
						token.trim().length > 0
				)
		)
	];

	console.log(
		`[Faculty Push] Found ${tokens.length} registered device token(s) for ${ids.join(', ')}`
	);

	if (!tokens.length) {
		console.warn(
			`[Faculty Push] No device token found for faculty: ${ids.join(', ')}`
		);

		return {
			sent: 0,
			failed: 0,
			removed: 0,
			tokenCount: 0
		};
	}

	const normalizedData = normalizeData(data);

	let sent = 0;
	let failed = 0;
	let removed = 0;

	// Firebase allows a maximum of 500 tokens per multicast request.
	for (let i = 0; i < tokens.length; i += 500) {
		const batch = tokens.slice(i, i + 500);

		console.log(
			`[Faculty Push] Sending batch of ${batch.length} token(s)`
		);

		const message = {
			tokens: batch,

			notification: {
				title: String(title || 'INTELLEKT'),
				body: String(body || '')
			},

			data: normalizedData,

			android: {
				priority: 'high',

				notification: {
					channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
					sound: 'default',
					defaultSound: true,
					defaultVibrateTimings: true,
					visibility: 'public'
				}
			}
		};

		let response;

		try {
			response = await messaging.sendEachForMulticast(message);
		} catch (error) {
			console.error(
				'[Faculty Push] Firebase request failed:',
				{
					code: error.code,
					message: error.message,
					stack: error.stack
				}
			);

			failed += batch.length;
			continue;
		}

		sent += response.successCount;
		failed += response.failureCount;

		console.log(
			`[Faculty Push] Firebase result: ${response.successCount} sent, ${response.failureCount} failed`
		);

		const invalidTokens = [];

		response.responses.forEach((item, index) => {
			if (item.success) {
				console.log(
					`[Faculty Push] Token ${index + 1}/${batch.length}: accepted by Firebase`
				);

				return;
			}

			const errorCode = item.error?.code || 'unknown-error';
			const errorMessage =
				item.error?.message || 'Unknown Firebase error';

			console.error(
				`[Faculty Push] Token ${index + 1}/${batch.length} failed:`,
				{
					code: errorCode,
					message: errorMessage
				}
			);

			if (INVALID_TOKEN_CODES.has(errorCode)) {
				invalidTokens.push(batch[index]);
			}
		});

		if (invalidTokens.length) {
			try {
				const deleted = await pool.query(
					`DELETE FROM faculty_device_tokens
					 WHERE token = ANY($1::text[])`,
					[invalidTokens]
				);

				removed += deleted.rowCount || 0;

				console.log(
					`[Faculty Push] Removed ${deleted.rowCount || 0} invalid token(s)`
				);
			} catch (error) {
				console.error(
					'[Faculty Push] Failed to remove invalid tokens:',
					error
				);
			}
		}
	}

	console.log(
		`[Faculty Push] Final result for ${ids.join(', ')}: ` +
		`${sent} sent, ${failed} failed, ${removed} removed`
	);

	return {
		sent,
		failed,
		removed,
		tokenCount: tokens.length
	};
}

async function createFacultyNotification(
	pool,
	{
		facultyId,
		moduleName,
		message,
		title = 'INTELLEKT',
		data = {}
	}
) {
	const id = String(facultyId || '')
		.trim()
		.toUpperCase();

	if (!id) {
		console.warn(
			'[Faculty Notification] Notification skipped: faculty ID is empty'
		);

		return {
			inserted: false,
			sent: 0,
			failed: 0,
			removed: 0
		};
	}

	let result;

	try {
		result = await pool.query(
			`INSERT INTO faculty_notifications
				(faculty_id, module_name, message, is_read)
			 VALUES ($1, $2, $3, FALSE)
			 RETURNING id, faculty_id, module_name, message, created_at`,
			[id, moduleName, message]
		);
	} catch (error) {
		console.error(
			'[Faculty Notification] Database insert failed:',
			error
		);

		throw error;
	}

	const notification = result.rows[0];

	console.log(
		`[Faculty Notification] Created notification #${notification.id} for ${id}`
	);

	const push = await sendToFaculty(pool, [id], {
		title,
		body: message,
		data: {
			...data,
			notification_id: notification.id,
			faculty_id: id,
			module_name: moduleName
		}
	});

	console.log(
		`[Faculty Notification] Push completed for ${id}:`,
		push
	);

	return {
		inserted: result.rowCount > 0,
		notificationId: notification.id,
		...push
	};
}

module.exports = {
	sendToFaculty,
	createFacultyNotification
};