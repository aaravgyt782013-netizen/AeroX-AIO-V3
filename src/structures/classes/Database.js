import BetterSQLite3 from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '#utils/logger';
import { registerNeonSnapshot, scheduleNeonSnapshot } from '#database/neon/snapshots';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Database {
	constructor(dbPath) {
		this.path = path.resolve(__dirname, '..', '..', dbPath);

		fs.ensureDirSync(path.dirname(this.path));

		try {
			const sqlite = new BetterSQLite3(this.path, {
				fileMustExist: false,
				verbose:
					process.env.NODE_ENV === 'development'
						? msg => logger.debug('Database', msg)
						: null,
			});

			sqlite.pragma('journal_mode   =WAL');
			sqlite.pragma('synchronous   =NORMAL');
			this.snapshotKey = path.basename(this.path);
			this.sqlite = sqlite;
			this.db = new Proxy(sqlite, {
				get: (target, property) => {
					if (property === 'exec') {
						return (...args) => {
							const result = target.exec(...args);
							scheduleNeonSnapshot(this.snapshotKey);
							return result;
						};
					}
					if (property === 'prepare') {
						return (...args) => {
							const statement = target.prepare(...args);
							return new Proxy(statement, {
								get: (stmt, key) => {
									if (key === 'run') {
										return (...values) => {
											const result = stmt.run(...values);
											scheduleNeonSnapshot(this.snapshotKey);
											return result;
										};
									}
									const value = Reflect.get(stmt, key, stmt);
									return typeof value === 'function' ? value.bind(stmt) : value;
								},
							});
						};
					}
					const value = Reflect.get(target, property, target);
					return typeof value === 'function' ? value.bind(target) : value;
				},
			});
			registerNeonSnapshot(this.snapshotKey, sqlite, this.path);
		} catch (error) {
			logger.error(
				'Database',
				`Failed to connect to ${path.basename(dbPath)}`,
				error,
			);
			throw error;
		}
	}

	exec(sql, params = []) {
		try {
			return this.db.prepare(sql).run(params);
		} catch (error) {
			logger.error('Database', `Failed to execute SQL: ${sql}`, error);
			throw error;
		}
	}

	get(sql, params = []) {
		try {
			return this.db.prepare(sql).get(params);
		} catch (error) {
			logger.error('Database', `Failed to get row: ${sql}`, error);
			throw error;
		}
	}

	all(sql, params = []) {
		try {
			return this.db.prepare(sql).all(params);
		} catch (error) {
			logger.error('Database', `Failed to get all rows: ${sql}`, error);
			throw error;
		}
	}

	prepare(sql) {
		try {
			return this.db.prepare(sql);
		} catch (error) {
			logger.error('Database', `Failed to prepare statement: ${sql}`, error);
			throw error;
		}
	}

	close() {
		try {
			this.db.close();
			logger.info(
				'Database',
				`Closed connection to ${path.basename(this.path)}`,
			);
		} catch (error) {
			logger.error(
				'Database',
				`Failed to close connection to ${path.basename(this.path)}`,
				error,
			);
		}
	}
}
