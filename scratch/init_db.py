import asyncio, asyncpg

async def main():
    c = await asyncpg.connect('postgresql://postgres:postgres@127.0.0.1:5432/postgres')
    res = await c.fetch('SELECT datname FROM pg_database')
    names = [r['datname'] for r in res]
    if 'maja' not in names:
        await c.execute('CREATE DATABASE maja')
        print('Created DB maja')
    else:
        print('DB maja exists')
    await c.close()

asyncio.run(main())
