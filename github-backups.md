# GitHub Backups


## Background
Although Git repositories provide a reliable system for distributed file management and revision control, the removal of an entire **repository**, whether malicious or accidental, could be a major problem, especially given that much of the OpenShift platform itself is managed using Git repositories.  Additionally, there is a number of GitHub resources that are not Git-specific and would not be included in a user's local copy of a repository, such as issues, pull requests, and releases.

Backups are made of the most critical repositories to guard against disaster in the event of a repository or repositories getting destroyed without being able to restore via the GitHub UI.


## Requirements
- Backups for some repositories must include ancillary resources, such as issues and pull requests.
- A clear plan for restoring repositories
- Backups must be stored outside of the DevExchange's OpenShift platform, specifically in the BC government's Amazon S3 account.
- A daily backup schedule


## Options Considered
1) BackHub, a third party service that simplifies the backup and restore process.  Backups are stored in Amazon S3.
  https://github.com/marketplace/backhub

2) Custom backup scripts that utilize a combination of Git cloning and GitHub API calls to back up files and necessary resources.

3) Custom scripts that use an open-source package designed for taking GitHub backups.

  Option 1 was rejected, because all BackHub backups are stored in Germany.  We want our backups to remain in Canada.
  Option 2 was rejected, because of the effort involved in creating and maintaining scripts that must call numerous GitHub APIs.
  Option 3 was selected, because it meets all requirements while minimizing effort.  A shell wrapper script is used to call the 'github-backup' program.


## Storage
The OCIO provides an Amazon S3 service for the BC government.  A bucket has been created called 'github-backup'.  The credentials for this bucket are stored as a Secret in the 'gitops-tools' project in OpenShift.


## Current Implementation
The backups are run as OpenShift CronJobs using a container image that is built with the software packages that are needed.

The utility server is a BuildConfig in 'gitops-tools' that uses a Dockerfile and supporting files in the 'platform-services' repository.  To view or update the files for this build, see the tools/github-backups directory in the repository.
https://github.com/BCDevOps/platform-services

A package called 'python-github-backup' is used to make the actual backups.  The advantage of this package is that it makes all the GitHub API calls for us and has been well tested.
https://github.com/josegonzalez/python-github-backup

A shell script processes the command line arguments, prepares and runs the necessary backup commands, and synchronizes the local backup directory with the S3 bucket using 'minio'.  https://docs.min.io/docs/minio-client-complete-guide.html

An OpenShift CronJob is created that runs the container on a schedule and passes the repository information to the backup script.  The CronJobs are named beginning with "github-backups".


## Maintenance
#### Add a repository to the backups list
To add a repository to the list of repos being backed up, edit the ConfigMap 'github-repos-to-back-up' in the 'gitops-tools' project.  Add the repo to the existing list on a new line.
- Match the case of the organization and repository names when updating this list.
- To include ALL resources in the backup, such as issues, pull requests, and labels, add ":full" after the repository name in the list.  For example, "BCDevOps/platform-services:full"

#### Change the schedule
To change the time or dates that the backup job runs, use the Administrator view of 'gitops-tools' to access Workloads --> Cron Jobs --> github-backups.  Click the YAML tab to edit the definition, changing the 'schedule' field as needed.  Use standard crontab notation.

#### Dealing with the API rate limit
For authenticated GitHub API calls, there is a limit of 5,000 requests per hour.  This would normally be enough, but taking a full backup of a repository can result in thousands of API calls.  For example, there are two API calls for each issue in a repository.  The 'developer-experience' repository has well over 1,000 issues, so that's about half of the one-hour limit right there, and there are many other API calls needed.  For this reason, the backup of the developer-experience repository has been moved to its own CronJob at a separate time.  If the script hits the rate limit, it will pause until enough time has passed to reset the limit.

#### Update the utility-server image
It will be necessary from time to time to update the utility-server image in order to update software, add more tools, or update the shell script.  To do so, update the files in platform-services repository in the tools/github-backups directory, then rebuild utility-server in gitops-tools after confirming the repo and branch info in the BuildConfig.


## Restoring a Repository
There are two potential methods of restoring a GitHub repository.  It may be possible to restore the repository using the GitHub console, which can be done within 90 days of the deletion of the repo.  If that is not possible, the repo must be restored manually.

### Restoring a repo using the GitHub web console
If possible, restore the repository using the GitHub console.  See the GitHub documentation.
https://docs.github.com/en/github/administering-a-repository/managing-repository-settings/restoring-a-deleted-repository#restoring-a-deleted-repository-that-was-owned-by-an-organization

### Restoring from backup
Restoring a repository from backup will require care, and the process may vary from repo to repo.

To restore a repository's files (just the Git files, not other resources like issues):
- Mount the S3 bucket using a system that has both Git and Minio/S3 clients.
  - Set the following environment variables, based on the values in the Secret in gitops-tools:
    - S3_URL
    - S3_ID
    - S3_SECRET
- Initialize the S3 connection
  - `mc alias set s3 $S3_URL $S3_ID $S3_SECRET`
- Copy the desired repository files to your local system.
  - For example, copy the platform-services repo to /tmp/platform-services:
    - `mc cp --recursive --preserve s3/github-backup/BCDevOps/repositories/platform-services/repository /tmp`
- Recreate the repository in GitHub.
- Change to the local copy of the repository, e.g.,
  - `cd /tmp/repositories/platform-services/repository`
- Do a checkout for each branch, otherwise they won't all get created in the new empty repository.
  - `for b in \`git branch -r | grep -v " -> " | sed 's/^.*origin\///'\`; do git checkout $b; done`
- Set the remote URL to the new repo
  - `git remote set-url origin https://github.com/BCDevOps/platform-services.git`
- Push to the newly created repository
  - `git push --all origin`

- Git resources: files, history, branches
- Non-Git resources: pull requests, issues, releases, etc.


## Issues
#### A full backup has to download everything every time
There is no way to know if an issue has been updated since the last backup was run, so the script has to fetch all resources every time.  This takes time, of course, but is manageable with the current list of repositories for backup.  This also means that there is more data being transferred to S3 each time.

#### API rate limit may require management
Over time, repositories will have more issues, pull requests, etc., meaning that there will be more API calls for the given list of repositories.  As with any backup system, periodic checks should be made on the health of the system.  Check the logs of the most recent backup pod to see if the API rate limit has been hit.  If so, scan the log to identify the repo(s) with the most API calls and move those repositories to a separate CronJob, similar to how the developer-experience repository is in its own CronJob.

