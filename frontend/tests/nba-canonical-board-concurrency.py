"""Exercise the migration with independent sessions in a disposable fixture database."""

import argparse
import os
from pathlib import Path
import re
import subprocess
import time
from contextlib import contextmanager


def replay(psql, socket, port, database):
    if not re.fullmatch(r"sach_nba_board_test_[a-z0-9_]+", database):
        raise ValueError("The database must be a disposable sach_nba_board_test_* fixture")
    if not (socket / f".s.PGSQL.{port}").is_socket():
        raise ValueError("An explicit PostgreSQL Unix socket directory is required")
    command = [
        psql, "-XqAt", "-h", str(socket), "-p", str(port), "-d", database,
        "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
    ]
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update(PGPASSFILE=os.devnull, PGOPTIONS="-c statement_timeout=15000")

    def query(sql, expect_error=None):
        result = subprocess.run(
            command + ["-c", sql], env=env, capture_output=True, text=True, timeout=20
        )
        if expect_error is None:
            assert result.returncode == 0, result.stderr
        else:
            assert result.returncode != 0 and expect_error in result.stderr, result
        return result.stdout.strip()

    @contextmanager
    def session(name, *, lost_response=False):
        with subprocess.Popen(
            command, env={**env, "PGAPPNAME": name}, text=True,
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL if lost_response else subprocess.PIPE,
            stderr=subprocess.PIPE,
        ) as process:
            try:
                yield process
            finally:
                if process.poll() is None:
                    process.terminate()

    def send(process, sql):
        process.stdin.write(sql + "\n")
        process.stdin.flush()

    def step(process, sql):
        send(process, sql + "\n\\echo fixture_step_done")
        for line in process.stdout:
            if line.strip() == "fixture_step_done":
                return
        raise AssertionError(process.stderr.read())

    def wait_for_lock(process, name):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline and process.poll() is None:
            if query(f"select exists (select from pg_stat_activity where application_name='{name}' "
                     "and wait_event_type='Lock' and wait_event='advisory');") == "t":
                return
            time.sleep(0.05)
        raise AssertionError("The competing session did not wait on the advisory lock")

    def attempt(market, quote, mode="insert"):
        return f"select public.fixture_nba_put('upcoming','{market}','{quote}','{mode}');"

    def receipt(market):
        return query(
            "set role service_role; select to_jsonb(h) from public.history_documents h "
            f"where sport='nba' and stream='slate_board_{market}';"
        )

    assert query(
        "select inet_server_addr() is null and to_regprocedure("
        "'public.fixture_nba_put(text,text,text,text)') is not null;"
    ) == "t"

    for market, mode in [("rebounds", "insert"), ("assists", "legacy")]:
        with session("sach_h7_first") as first, session("sach_h7_competing") as second:
            step(first, "begin; set local role service_role; " + attempt(market, "first"))
            assert not receipt(market), "Uncommitted original was visible"
            send(second, "set role service_role; " + attempt(market, "second", mode))
            wait_for_lock(second, "sach_h7_competing")
            step(first, "commit;")
            original = receipt(market)
            _, error = second.communicate(timeout=20)
            if mode == "insert":
                assert second.returncode == 0, error
            else:
                assert second.returncode != 0 and "23514: canonical NBA originals are immutable" in error, error
            assert '"quoteId": "first"' in original and receipt(market) == original
    print("PASS concurrent insert and legacy upsert preserve the first row")

    with session("sach_h7_disconnected") as disconnected:
        step(disconnected, "begin; set local role service_role; " + attempt("blocks", "no-commit"))
        disconnected.terminate()
        disconnected.wait(timeout=10)
    assert not receipt("blocks")
    with session("sach_h7_discarded_ack", lost_response=True) as lost:
        _, error = lost.communicate(
            "begin; set local role service_role; " + attempt("blocks", "committed") + "\ncommit;\n",
            timeout=20,
        )
        assert lost.returncode == 0, error
    committed = receipt("blocks")
    query("set role service_role; " + attempt("blocks", "retry"))
    assert '"quoteId": "committed"' in committed and receipt("blocks") == committed
    print("PASS disconnected transaction rolls back and discarded commit response preserves the original")

    query(
        "with upcoming as (update public.fixture_nba_slates set tip=clock_timestamp()+interval '6 seconds' "
        "where name='upcoming' returning day, tip) update nba_board_admission.verified_slates s "
        "set fixtures=jsonb_build_object('10001',public.fixture_iso(upcoming.tip)) "
        "from upcoming where s.game_date=upcoming.day;"
    )
    with session("sach_h7_holder") as holder, session("sach_h7_boundary") as delayed:
        step(holder, "begin; select pg_advisory_xact_lock(hashtextextended("
             "'sach:nba:canonical:slate_board_steals:' || day::text, 0)) "
             "from public.fixture_nba_slates where name='upcoming';")
        assert query("select clock_timestamp() < tip from public.fixture_nba_slates where name='upcoming';") == "t"
        send(delayed, "set role service_role; " + attempt("steals", "delayed"))
        wait_for_lock(delayed, "sach_h7_boundary")
        step(holder, "select pg_sleep_until(tip + interval '100 milliseconds') "
             "from public.fixture_nba_slates where name='upcoming'; commit;")
        _, error = delayed.communicate(timeout=20)
        assert delayed.returncode != 0 and "23514: canonical NBA board admission is closed" in error, error
    assert not receipt("steals")
    print("PASS insert waiting across tipoff is rejected by the database wall clock")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--socket", type=Path, required=True)
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    replay(args.psql, args.socket.resolve(), args.port, args.database)
