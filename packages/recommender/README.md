# @agnostic/recommender

Turns a prompt, the profiles this machine has, and the catalog into one pick: which agent and
model to run this task on, what the evidence behind it is, what the second choice is, and what
would be worth trying if it were enabled.

Pure functions. Everything it needs arrives as arguments: it reads no file but its own keyword
table, holds no state, and makes no call.

Not here: detecting harnesses (`registry`), fetching or parsing the catalog (`catalog`), pricing
tables (`catalog`), reading the ledger's own outcomes (`ledger`; they arrive as
history rows), and assembling the input (`daemon`).
