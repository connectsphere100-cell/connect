# Backup and recovery

Use MongoDB Atlas continuous backup or scheduled snapshots appropriate to the production tier. Restrict restore privileges and retain encrypted backups according to business and legal requirements. Document the selected recovery point and recovery time objectives with the operator.

Before production launch, restore a recent backup into an isolated cluster, verify core collections and indexes, and test application access using separate credentials. This repository does not configure Atlas backups or provide evidence of a restore drill.
