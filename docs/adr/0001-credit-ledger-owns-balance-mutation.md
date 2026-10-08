# Credit ledger owns balance mutation

Credit mutations are committed by inserting an immutable Credit Ledger Entry. Database triggers on
that insert validate the expected balance and update the Credit Account balance, so the ledger and
the balance change within the same statement. This keeps the two facts atomic while retaining the
balance as an efficient projection; application-level read-then-update sequences and
version-based compare-and-swap are rejected because they can leave the two facts inconsistent.
