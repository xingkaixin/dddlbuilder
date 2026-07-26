# Credit ledger owns balance mutation

Credit mutations are committed by inserting an immutable Credit Ledger Entry, and
the Credit Account balance is updated in the same database statement. This keeps
the ledger and balance atomic while retaining the balance as an efficient
projection; application-level read-then-update sequences are rejected because
they can leave the two facts inconsistent.
