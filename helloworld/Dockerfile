FROM library/centos:7
RUN yum -y install nmap-ncat telnet
CMD i=1 && while [ $i -lt 100 ]; do printf 'HTTP/1.1 200 OK\n\n%s' "Hello, world.  --> $i" | nc -l 9999; i=`expr $i + 1`; done
EXPOSE 9999
