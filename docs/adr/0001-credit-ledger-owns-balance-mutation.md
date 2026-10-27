# Credit ledger owns balance mutation

Every credit mutation is the insert of an immutable Credit Ledger Entry. Database triggers on
that insert validate the expected balance and update the Credit Account balance, so the ledger and
the balance change within the same statement. The two facts stay atomic, and the balance remains a
projection that is cheap to read. We rejected application-level read-then-update sequences and
version-based compare-and-swap because they can leave the two facts inconsistent.
