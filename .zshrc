export PATH="/usr/local/bin:$PATH"

# Python PATH - /usr/local/bin should come BEFORE /usr/bin
export PATH="/usr/local/bin:$PATH"

# Your existing PATH entries will follow automatically
export PATH="$PATH:/opt/homebrew/bin"  # For Apple Silicon, but you're on Intel

# Python aliases for convenience
alias python="python3"
alias python3.13="/usr/local/bin/python3.13"
alias python3.14="/usr/local/bin/python3.14"
alias python3.12="/usr/local/bin/python3.12"

# pip aliases
alias pip="pip3"
alias pip3.13="/usr/local/bin/pip3.13"
alias pip3.14="/usr/local/bin/pip3.14"

# Add any other customizations you had below...
